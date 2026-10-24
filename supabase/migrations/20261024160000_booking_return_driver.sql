-- TVP valet: independent return (Retour) driver per booking.
-- Project: xblgioeurvzqeaitumdq ONLY. Run once in the Supabase SQL editor.
-- Adds bookings.return_driver_id and lets staff set it through the existing
-- staff-only RPC update_booking_ops (also used by offline sync 'update_ops').
begin;

-- 1) Column: same shape as bookings.driver_id (FK to profiles, restrict delete).
alter table public.bookings
  add column if not exists return_driver_id uuid references public.profiles(id) on delete restrict;
create index if not exists bookings_return_driver_idx on public.bookings(return_driver_id);

-- 2) Same rule as driver_id: only an active account may be assigned.
--    Separate trigger so private.normalize_booking() stays untouched.
create or replace function private.check_return_driver() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.return_driver_id is not null
     and (tg_op = 'INSERT' or new.return_driver_id is distinct from old.return_driver_id)
     and not exists(select 1 from public.profiles where id = new.return_driver_id and active)
  then raise exception 'Assigned employee must be active' using errcode = '23514'; end if;
  return new;
end $$;
revoke all on function private.check_return_driver() from public,anon,authenticated;
drop trigger if exists bookings_return_driver_check on public.bookings;
create trigger bookings_return_driver_check before insert or update of return_driver_id on public.bookings
for each row execute function private.check_return_driver();

-- 3) Staff-only RPC: allow return_driver_id in the strict patch allowlist.
--    Identical to the current definition except for return_driver_id.
create or replace function public.update_booking_ops(p_id uuid,p_patch jsonb) returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare v_booking public.bookings;
begin
  if not private.is_staff() then raise exception 'Staff access required' using errcode = '42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Patch must be an object' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k
      where k not in ('key_cash','spot','km','comment','driver_id','return_driver_id')) then
    raise exception 'Patch contains forbidden fields' using errcode = '22023'; end if;
  if exists(select 1 from jsonb_each(p_patch) e where
    (e.key in ('key_cash','spot','comment','driver_id','return_driver_id') and jsonb_typeof(e.value) not in ('string','null'))
    or (e.key = 'km' and jsonb_typeof(e.value) not in ('number','null'))) then
    raise exception 'Patch contains invalid types' using errcode = '22023'; end if;
  select * into v_booking from public.bookings where id = p_id for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  -- jsonb_populate_record is used only after the strict allowlist/type check above.
  v_booking := jsonb_populate_record(v_booking,p_patch);
  update public.bookings set key_cash=v_booking.key_cash,spot=v_booking.spot,km=v_booking.km,
    comment=v_booking.comment,driver_id=v_booking.driver_id,return_driver_id=v_booking.return_driver_id
    where id=p_id returning * into v_booking;
  return v_booking;
end $$;
revoke all on function public.update_booking_ops(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.update_booking_ops(uuid,jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Check afterwards (should return 1 row, data_type uuid):
-- select column_name,data_type from information_schema.columns
--  where table_schema='public' and table_name='bookings' and column_name='return_driver_id';
