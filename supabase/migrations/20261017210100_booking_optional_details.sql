-- Additive nullable columns only, no inferred names or backfill.
-- Existing customer_name and all imported original fields remain unchanged.
begin;
alter table public.bookings
 add column if not exists first_name text,
 add column if not exists last_name text,
 add column if not exists car_description text;
do $$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.bookings'::regclass and conname='bookings_optional_details_lengths') then
  alter table public.bookings add constraint bookings_optional_details_lengths check (
   (first_name is null or length(first_name)<=120)
   and (last_name is null or length(last_name)<=120)
   and (car_description is null or length(car_description)<=500)
  );
 end if;
end $$;
-- No staff RPC allowlist changes. Existing direct writes are admin-only via RLS.
notify pgrst,'reload schema';
commit;
