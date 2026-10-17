-- Operational facts are isolated from the imported booking snapshot.
begin;
create table public.booking_operations (
  id uuid not null unique default gen_random_uuid(),
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  taken_away_at timestamptz,
  customer_called_at timestamptz,
  ride_started_at timestamptz,
  performed_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default clock_timestamp()
);
create table public.booking_operation_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  action text not null check (action in ('taken_away','customer_called','ride_started')),
  occurred_at timestamptz not null,
  actor_id uuid not null references public.profiles(id),
  unique(booking_id,action)
);
alter table public.booking_operations enable row level security;
alter table public.booking_operation_events enable row level security;
revoke all on public.booking_operations,public.booking_operation_events from public,anon,authenticated;
grant select on public.booking_operations,public.booking_operation_events to authenticated;
grant all on public.booking_operations,public.booking_operation_events to service_role;
grant usage,select on sequence public.booking_operation_events_id_seq to service_role;
create policy booking_operations_staff_read on public.booking_operations for select to authenticated using ((select private.is_staff()));
create policy booking_operation_events_staff_read on public.booking_operation_events for select to authenticated using ((select private.is_staff()));
create trigger booking_operations_audit after insert or update or delete on public.booking_operations for each row execute function private.audit_change();
create trigger booking_operation_events_audit after insert or update or delete on public.booking_operation_events for each row execute function private.audit_change();

create function public.record_booking_operation(p_booking_id uuid,p_action text) returns public.booking_operations
language plpgsql security definer set search_path = ''
as $$
declare v_booking public.bookings; v_ops public.booking_operations; v_now timestamptz;
begin
  if not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('taken_away','customer_called','ride_started') then
    raise exception 'Invalid operational action' using errcode='22023'; end if;
  -- Lock source for serializable actions, but never update it.
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found' using errcode='P0002'; end if;
  select * into v_ops from public.booking_operations where booking_id=p_booking_id;
  -- Idempotent retries preserve actor and original timestamp even after checkout.
  if found and ((p_action='taken_away' and v_ops.taken_away_at is not null)
    or (p_action='customer_called' and v_ops.customer_called_at is not null)
    or (p_action='ride_started' and v_ops.ride_started_at is not null)) then return v_ops; end if;
  if v_booking.status <> 'confirmed' or v_booking.checked_out_at is not null then
    raise exception 'Operation requires an open confirmed booking' using errcode='23514'; end if;
  if p_action in ('taken_away','ride_started') and v_booking.checked_in_at is null then
    raise exception 'Vehicle must be checked in' using errcode='23514'; end if;
  v_now := clock_timestamp();
  if v_booking.checked_in_at > v_now then raise exception 'Check-in is in the future' using errcode='23514'; end if;
  insert into public.booking_operations(booking_id,performed_by,updated_at) values(p_booking_id,auth.uid(),v_now)
    on conflict(booking_id) do nothing;
  update public.booking_operations set
    taken_away_at=case when p_action='taken_away' then v_now else taken_away_at end,
    customer_called_at=case when p_action='customer_called' then v_now else customer_called_at end,
    ride_started_at=case when p_action='ride_started' then v_now else ride_started_at end,
    performed_by=auth.uid(),updated_at=v_now where booking_id=p_booking_id returning * into v_ops;
  insert into public.booking_operation_events(booking_id,action,occurred_at,actor_id) values(p_booking_id,p_action,v_now,auth.uid());
  return v_ops;
end $$;
revoke all on function public.record_booking_operation(uuid,text) from public,anon,authenticated;
grant execute on function public.record_booking_operation(uuid,text) to authenticated;
-- Restore original strict patch scope if an earlier nullable-column draft was already applied.
create or replace function public.update_booking_ops(p_id uuid,p_patch jsonb) returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare v_booking public.bookings;
begin
  if not private.is_staff() then raise exception 'Staff access required' using errcode = '42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Patch must be an object' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k
      where k not in ('key_cash','spot','km','comment','driver_id')) then
    raise exception 'Patch contains forbidden fields' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_each(p_patch) e where
    (e.key in ('key_cash','spot','comment','driver_id') and jsonb_typeof(e.value) not in ('string','null'))
    or (e.key = 'km' and jsonb_typeof(e.value) not in ('number','null'))) then
    raise exception 'Patch contains invalid types' using errcode = '22023'; end if;
  select * into v_booking from public.bookings where id = p_id for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  -- jsonb_populate_record is used only after the strict allowlist/type check above.
  v_booking := jsonb_populate_record(v_booking,p_patch);
  update public.bookings set key_cash=v_booking.key_cash,spot=v_booking.spot,km=v_booking.km,
    comment=v_booking.comment,driver_id=v_booking.driver_id where id=p_id returning * into v_booking;
  return v_booking;
end $$;

commit;
