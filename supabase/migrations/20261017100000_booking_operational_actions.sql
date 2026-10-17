-- Additive operational timestamps only. No existing booking values are changed.
begin;
alter table public.bookings
  add column taken_away_at timestamptz,
  add column customer_called_at timestamptz,
  add column ride_started_at timestamptz;
-- Taking a received car away / starting its return drive require an existing check-in.
-- Do not enforce called-before-drive: a driver can legitimately start before the customer calls.
alter table public.bookings add constraint bookings_ops_after_checkin check (
  (taken_away_at is null or (checked_in_at is not null and taken_away_at >= checked_in_at))
  and (ride_started_at is null or (checked_in_at is not null and ride_started_at >= checked_in_at))
);
alter table public.bookings add constraint bookings_ops_before_checkout check (
  checked_out_at is null or
  ((taken_away_at is null or taken_away_at <= checked_out_at)
   and (customer_called_at is null or customer_called_at <= checked_out_at)
   and (ride_started_at is null or ride_started_at <= checked_out_at))
);
create or replace function public.update_booking_ops(p_id uuid,p_patch jsonb) returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare v_booking public.bookings;
begin
  if not private.is_staff() then raise exception 'Staff access required' using errcode = '42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Patch must be an object' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k
      where k not in ('key_cash','spot','km','comment','driver_id','taken_away_at','customer_called_at','ride_started_at')) then
    raise exception 'Patch contains forbidden fields' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_each(p_patch) e where
    (e.key in ('key_cash','spot','comment','driver_id','taken_away_at','customer_called_at','ride_started_at') and jsonb_typeof(e.value) not in ('string','null'))
    or (e.key = 'km' and jsonb_typeof(e.value) not in ('number','null'))) then
    raise exception 'Patch contains invalid types' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_each_text(p_patch) e where
    e.key in ('taken_away_at','customer_called_at','ride_started_at') and e.value is not null
    and e.value !~ 'T.*(Z|[+-][0-9]{2}:[0-9]{2})$') then
    raise exception 'Timestamps require explicit timezone offsets' using errcode = '22023'; end if;
  select * into v_booking from public.bookings where id = p_id for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if v_booking.status <> 'confirmed' and exists(select 1 from jsonb_object_keys(p_patch) k
    where k in ('taken_away_at','customer_called_at','ride_started_at')) then
    raise exception 'Operational actions require a confirmed booking' using errcode = '23514'; end if;
  -- jsonb_populate_record is used only after the strict allowlist/type check above.
  v_booking := jsonb_populate_record(v_booking,p_patch);
  update public.bookings set key_cash=v_booking.key_cash,spot=v_booking.spot,km=v_booking.km,
    comment=v_booking.comment,driver_id=v_booking.driver_id,
    taken_away_at=v_booking.taken_away_at,customer_called_at=v_booking.customer_called_at,
    ride_started_at=v_booking.ride_started_at where id=p_id returning * into v_booking;
  return v_booking;
end $$;

-- CREATE OR REPLACE preserves existing grants, make them explicit for auditable deployment.
revoke all on function public.update_booking_ops(uuid,jsonb) from public,anon;
grant execute on function public.update_booking_ops(uuid,jsonb) to authenticated;
commit;
