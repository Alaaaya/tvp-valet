-- Retrieval is its own operational fact, never a customer call or checkout.
begin;
alter table public.booking_operations add column retrieved_at timestamptz;
alter table public.booking_operation_events drop constraint booking_operation_events_action_check;
alter table public.booking_operation_events add constraint booking_operation_events_action_check check (action in ('taken_away','retrieved','customer_called','ride_started'));
create or replace function public.record_booking_operation(p_booking_id uuid,p_action text) returns public.booking_operations
language plpgsql security definer set search_path = ''
as $$
declare v_booking public.bookings; v_ops public.booking_operations; v_now timestamptz;
begin
  if not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('taken_away','retrieved','customer_called','ride_started') then
    raise exception 'Invalid operational action' using errcode='22023'; end if;
  -- Lock source for serializable actions, but never update it.
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found' using errcode='P0002'; end if;
  select * into v_ops from public.booking_operations where booking_id=p_booking_id;
  -- Idempotent retries preserve actor and original timestamp even after checkout.
  if found and ((p_action='taken_away' and v_ops.taken_away_at is not null)
    or (p_action='retrieved' and v_ops.retrieved_at is not null)
    or (p_action='customer_called' and v_ops.customer_called_at is not null)
    or (p_action='ride_started' and v_ops.ride_started_at is not null)) then return v_ops; end if;
  if v_booking.status <> 'confirmed' or v_booking.checked_out_at is not null then
    raise exception 'Operation requires an open confirmed booking' using errcode='23514'; end if;
  if p_action in ('taken_away','retrieved','ride_started') and v_booking.checked_in_at is null then
    raise exception 'Vehicle must be checked in' using errcode='23514'; end if;
  v_now := clock_timestamp();
  if v_booking.checked_in_at > v_now then raise exception 'Check-in is in the future' using errcode='23514'; end if;
  insert into public.booking_operations(booking_id,performed_by,updated_at) values(p_booking_id,auth.uid(),v_now)
    on conflict(booking_id) do nothing;
  update public.booking_operations set
    taken_away_at=case when p_action='taken_away' then v_now else taken_away_at end,
    retrieved_at=case when p_action='retrieved' then v_now else retrieved_at end,
    customer_called_at=case when p_action='customer_called' then v_now else customer_called_at end,
    ride_started_at=case when p_action='ride_started' then v_now else ride_started_at end,
    performed_by=auth.uid(),updated_at=v_now where booking_id=p_booking_id returning * into v_ops;
  insert into public.booking_operation_events(booking_id,action,occurred_at,actor_id) values(p_booking_id,p_action,v_now,auth.uid());
  return v_ops;
end $$;
revoke all on function public.record_booking_operation(uuid,text) from public,anon,authenticated;
grant execute on function public.record_booking_operation(uuid,text) to authenticated;

commit;
