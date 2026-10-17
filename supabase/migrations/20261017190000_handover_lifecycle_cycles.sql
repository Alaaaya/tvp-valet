-- Lifecycle snapshot binding and operational cycle invalidation. No backfill or booking writes.
begin;
-- Plain REST admin edits cannot restore stale lifecycle fields. Security-definer lifecycle
-- RPCs run as their owner; direct authenticated updates run as authenticated.
create function private.guard_booking_lifecycle_update() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('anon','authenticated')
    and ((TG_OP='INSERT' and (new.checked_in_at is not null or new.checked_out_at is not null))
      or (TG_OP='UPDATE' and (new.checked_in_at is distinct from old.checked_in_at
        or new.checked_out_at is distinct from old.checked_out_at))) then
    raise exception 'Lifecycle timestamps require a lifecycle RPC' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_booking_lifecycle_update() from public,anon,authenticated;
create trigger bookings_lifecycle_guard before insert or update on public.bookings
  for each row execute function private.guard_booking_lifecycle_update();

-- Keep validated completion implementation inaccessible to API callers.
alter function public.complete_booking_handover(uuid,uuid,text,jsonb,jsonb) set schema private;
alter function private.complete_booking_handover(uuid,uuid,text,jsonb,jsonb) rename to complete_booking_handover_core;
revoke all on function private.complete_booking_handover_core(uuid,uuid,text,jsonb,jsonb)
  from public,anon,authenticated,service_role;

-- Eight required parameters, including explicitly nullable expected timestamps.
-- No five-argument overload/default can silently bypass snapshot validation.
create function public.complete_booking_handover(
  p_request_id uuid,p_booking_id uuid,p_action text,p_details jsonb,p_media jsonb,
  p_expected_in timestamptz,p_expected_out timestamptz,p_expected_revision bigint
) returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare v_booking public.bookings; v_receipt public.booking_handovers; v_revision bigint;
begin
  if not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_request_id is null or p_booking_id is null or p_action is null or p_action not in ('in','out')
    or (p_expected_in is not null and not isfinite(p_expected_in))
    or (p_expected_out is not null and not isfinite(p_expected_out))
    or (p_expected_revision is null or p_expected_revision < 0) then
    raise exception 'Invalid handover identity, action or snapshot' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,170017));
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found' using errcode='P0002'; end if;
  select * into v_receipt from public.booking_handovers where id=p_request_id;
  if found then
    -- Core validates matching booking/action and rejects undone receipts.
    -- Legitimate completed-request retries ignore snapshots and mutable draft data.
    return private.complete_booking_handover_core(p_request_id,p_booking_id,p_action,p_details,p_media);
  end if;
  select count(*) into v_revision from public.booking_handover_undos where booking_id=p_booking_id;
  if v_revision is distinct from p_expected_revision then
    raise exception 'Lifecycle revision changed; reopen handover' using errcode='40001'; end if;
  if v_booking.checked_in_at is distinct from p_expected_in
    or v_booking.checked_out_at is distinct from p_expected_out then
    raise exception 'Lifecycle changed; reopen handover' using errcode='40001'; end if;
  return private.complete_booking_handover_core(p_request_id,p_booking_id,p_action,p_details,p_media);
end $$;
revoke all on function public.complete_booking_handover(uuid,uuid,text,jsonb,jsonb,timestamptz,timestamptz,bigint)
  from public,anon,authenticated;
grant execute on function public.complete_booking_handover(uuid,uuid,text,jsonb,jsonb,timestamptz,timestamptz,bigint)
  to authenticated;

alter table public.booking_operation_events
  add column undone_at timestamptz,
  add column undone_by uuid references public.profiles(id),
  add constraint booking_operation_events_undo_pair check ((undone_at is null) = (undone_by is null));
alter table public.booking_operation_events drop constraint booking_operation_events_booking_id_action_key;
create unique index booking_operation_events_active_unique
  on public.booking_operation_events(booking_id,action) where undone_at is null;

create function private.reset_operations_on_undo_checkin() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_now timestamptz;
begin
  if old.checked_in_at is not null and new.checked_in_at is null then
    v_now := clock_timestamp();
    update public.booking_operation_events set undone_at=v_now,undone_by=auth.uid()
      where booking_id=new.id and undone_at is null;
    update public.booking_operations set taken_away_at=null,retrieved_at=null,
      customer_called_at=null,ride_started_at=null,updated_at=v_now,performed_by=auth.uid()
      where booking_id=new.id;
  end if;
  return new;
end $$;
revoke all on function private.reset_operations_on_undo_checkin() from public,anon,authenticated;
create trigger bookings_reset_operations_after_undo after update of checked_in_at on public.bookings
  for each row execute function private.reset_operations_on_undo_checkin();

create or replace function public.record_booking_operation(p_booking_id uuid,p_action text) returns public.booking_operations
language plpgsql security definer set search_path = ''
as $$
declare v_booking public.bookings; v_ops public.booking_operations; v_now timestamptz;
begin
  if not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_action is null or p_action not in ('taken_away','retrieved','customer_called','ride_started') then
    raise exception 'Invalid operational action' using errcode='22023'; end if;
  -- Shared booking lock serializes undo/reset and new-cycle operations.
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
