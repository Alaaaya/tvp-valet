-- Dedicated TVP project only. Run using the Supabase migration owner, never a browser key.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  email text check (email is null or length(email) <= 254),
  role text not null default 'driver' check (role in ('admin','driver')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.products (
  code text primary key check (length(trim(code)) between 1 and 64),
  label text not null check (length(trim(label)) between 1 and 160),
  covered boolean not null default false,
  day_one numeric(12,2) not null default 40 check (day_one >= 0),
  daily_extra numeric(12,2) not null default 10 check (daily_extra >= 0),
  covered_extra numeric(12,2) not null default 10 check (covered_extra >= 0)
);
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default ('TVP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  external_id text,
  platform text not null default 'manual',
  customer_name text not null,
  phone text,
  email text,
  persons integer not null default 1 check (persons between 1 and 100),
  plate text,
  product text references public.products(code),
  covered boolean not null default false,
  arrival_at timestamptz not null,
  departure_at timestamptz not null,
  flight_in text,
  flight_out text,
  actual_flight_in timestamptz,
  actual_flight_out timestamptz,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','no_show')),
  total numeric(12,2) not null default 0 check (total >= 0),
  paid numeric(12,2) not null default 0 check (paid >= 0),
  key_cash text,
  spot text,
  km integer check (km >= 0),
  comment text,
  driver_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint bookings_external_unique unique (platform,external_id),
  constraint bookings_dates check (departure_at >= arrival_at),
  constraint bookings_check_order check (
    checked_out_at is null or (checked_in_at is not null and checked_out_at >= checked_in_at)),
  constraint bookings_active_check check (
    status = 'confirmed' or checked_in_at is null),
  constraint bookings_text_lengths check (
    length(trim(code)) between 1 and 64
    and length(trim(customer_name)) between 1 and 200
    and length(trim(platform)) between 1 and 64
    and (external_id is null or length(trim(external_id)) between 1 and 200)
    and coalesce(length(phone),0) <= 64
    and coalesce(length(email),0) <= 254
    and coalesce(length(plate),0) <= 40
    and coalesce(length(flight_in),0) <= 40
    and coalesce(length(flight_out),0) <= 40
    and coalesce(length(key_cash),0) <= 200
    and coalesce(length(spot),0) <= 100
    and coalesce(length(comment),0) <= 10000)
);
create index bookings_arrival_idx on public.bookings(arrival_at);
create index bookings_departure_idx on public.bookings(departure_at);
create index bookings_driver_idx on public.bookings(driver_id);
create index bookings_open_idx on public.bookings(status,checked_in_at,checked_out_at);
create table public.import_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  imported integer not null default 0,
  skipped integer not null default 0,
  errors jsonb not null default '[]'::jsonb
);
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  entity text not null,
  entity_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log(entity,entity_id,created_at desc);

create function private.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.profiles where id = auth.uid() and active) $$;
create function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.profiles where id = auth.uid() and active and role = 'admin') $$;

create function private.audit_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_old jsonb; v_new jsonb;
begin
  if TG_OP <> 'INSERT' then v_old := to_jsonb(old); end if;
  if TG_OP <> 'DELETE' then v_new := to_jsonb(new); end if;
  insert into public.audit_log(actor_id,entity,entity_id,action,old_data,new_data)
    values(auth.uid(),TG_TABLE_NAME,coalesce(v_new->>'id',v_new->>'code',v_old->>'id',v_old->>'code'),
      TG_OP,v_old,v_new);
  if TG_OP = 'DELETE' then return old; else return new; end if;
end $$;
create trigger profiles_audit after insert or update or delete on public.profiles
for each row execute function private.audit_change();
create trigger bookings_audit after insert or update or delete on public.bookings
for each row execute function private.audit_change();
create trigger products_audit after insert or update or delete on public.products
for each row execute function private.audit_change();
create trigger imports_audit after insert or update or delete on public.import_log
for each row execute function private.audit_change();

create function private.normalize_booking() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.platform := lower(trim(new.platform));
  new.external_id := nullif(trim(new.external_id),'');
  new.code := trim(new.code);
  new.customer_name := trim(new.customer_name);
  if new.driver_id is not null and not exists(
    select 1 from public.profiles where id = new.driver_id and active
  ) then raise exception 'Assigned employee must be active' using errcode = '23514'; end if;
  return new;
end $$;
create trigger bookings_normalize before insert or update on public.bookings
for each row execute function private.normalize_booking();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.bookings enable row level security;
alter table public.import_log enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.profiles, public.products, public.bookings, public.import_log, public.audit_log
  from anon, authenticated;
grant select on public.profiles, public.products, public.bookings, public.import_log, public.audit_log to authenticated;
grant insert,update,delete on public.products,public.bookings to authenticated;
grant all on public.profiles, public.products, public.bookings, public.import_log, public.audit_log to service_role;
grant usage,select on sequence public.audit_log_id_seq to service_role;
create policy profiles_staff_read on public.profiles for select to authenticated
  using ((select private.is_staff()));
create policy products_staff_read on public.products for select to authenticated
  using ((select private.is_staff()));
create policy bookings_staff_read on public.bookings for select to authenticated
  using ((select private.is_staff()));
create policy products_admin_insert on public.products for insert to authenticated
  with check ((select private.is_admin()));
create policy products_admin_update on public.products for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy products_admin_delete on public.products for delete to authenticated
  using ((select private.is_admin()));
create policy bookings_admin_insert on public.bookings for insert to authenticated
  with check ((select private.is_admin()));
create policy bookings_admin_update on public.bookings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy bookings_admin_delete on public.bookings for delete to authenticated
  using ((select private.is_admin()));
create policy imports_admin_read on public.import_log for select to authenticated
  using ((select private.is_admin()));
create policy audit_admin_read on public.audit_log for select to authenticated
  using ((select private.is_admin()));

create function public.check_booking(p_id uuid,p_action text) returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare v_booking public.bookings;
begin
  if not private.is_staff() then raise exception 'Staff access required' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('in','out') then
    raise exception 'Action must be in or out' using errcode = '22023'; end if;
  select * into v_booking from public.bookings where id = p_id for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Booking is not confirmed' using errcode = '23514'; end if;
  if p_action = 'in' then
    if v_booking.checked_in_at is not null or v_booking.checked_out_at is not null then
      raise exception 'Booking already checked in' using errcode = '23514'; end if;
    update public.bookings set checked_in_at = clock_timestamp() where id = p_id returning * into v_booking;
  else
    if v_booking.checked_in_at is null or v_booking.checked_out_at is not null then
      raise exception 'Check-out requires an open check-in' using errcode = '23514'; end if;
    update public.bookings set checked_out_at = clock_timestamp() where id = p_id returning * into v_booking;
  end if;
  return v_booking;
end $$;

create function public.update_booking_ops(p_id uuid,p_patch jsonb) returns public.bookings
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

create function public.manage_employee(
  p_user_id uuid, p_display_name text, p_role text, p_active boolean default true
) returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare v_profile public.profiles;
begin
  -- Serialize all role changes, including two simultaneous last-admin demotions.
  perform pg_advisory_xact_lock(73418,1);
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_role is null or p_role not in ('admin','driver') or p_active is null then
    raise exception 'Invalid employee role or active flag' using errcode = '22023'; end if;
  if exists(select 1 from public.profiles where id=p_user_id and role='admin' and active)
    and (p_role <> 'admin' or not p_active)
    and not exists(select 1 from public.profiles where id <> p_user_id and role='admin' and active) then
    raise exception 'Cannot disable or demote the last active admin' using errcode = '23514'; end if;
  insert into public.profiles(id,full_name,email,role,active)
    values(p_user_id,trim(p_display_name),(select email from auth.users where id=p_user_id),p_role,p_active)
    on conflict (id) do update set full_name=excluded.full_name,email=excluded.email,role=excluded.role,active=excluded.active
    returning * into v_profile;
  return v_profile;
end $$;

-- Frontend compatibility entry point. Same lock and last-admin invariant as manage_employee.
create function public.set_employee_role(p_id uuid,p_role text) returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare v_profile public.profiles;
begin
  perform pg_advisory_xact_lock(73418,1);
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select * into v_profile from public.profiles where id=p_id for update;
  if not found then raise exception 'Employee not found' using errcode = 'P0002'; end if;
  return public.manage_employee(p_id,v_profile.full_name,p_role,v_profile.active);
end $$;

-- Profile emails are informational and follow verified Auth identity data.
-- This trigger never provisions a profile or grants a role.
create function private.sync_profile_email() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email=new.email where id=new.id and email is distinct from new.email;
  return new;
end $$;
create trigger tvp_sync_profile_email after update of email on auth.users
for each row execute function private.sync_profile_email();

create function public.import_bookings(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb; v_booking public.bookings; v_id uuid; v_index integer := 0;
  v_imported integer := 0; v_skipped integer := 0; v_errors jsonb := '[]'::jsonb;
  v_log_id uuid; v_state text;
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows must be an array' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 1000 or octet_length(p_rows::text) > 2097152 then
    raise exception 'Import limit is 1000 rows / 2 MiB' using errcode = '22023'; end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_index := v_index+1;
    begin
      if jsonb_typeof(v_row) <> 'object' then raise exception 'Row must be an object' using errcode = '22023'; end if;
      if exists(select 1 from jsonb_object_keys(v_row) k where k not in
        ('code','external_id','platform','customer_name','phone','email','persons','plate','product','covered',
         'arrival_at','departure_at','flight_in','flight_out','actual_flight_in','actual_flight_out','status','total','paid')) then
        raise exception 'Unknown or operational fields' using errcode = '22023'; end if;
      if exists(select 1 from jsonb_each(v_row) e where
        (e.key in ('persons','total','paid') and jsonb_typeof(e.value) <> 'number')
        or (e.key='covered' and jsonb_typeof(e.value) <> 'boolean')
        or (e.key not in ('persons','total','paid','covered') and jsonb_typeof(e.value) not in ('string','null'))) then
        raise exception 'Invalid JSON value type' using errcode = '22023'; end if;
      if nullif(trim(v_row->>'external_id'),'') is null or nullif(trim(v_row->>'platform'),'') is null then
        raise exception 'external_id and platform required' using errcode = '22023'; end if;
      -- Require explicit timezone offsets for all imported timestamps.
      if exists(select 1 from jsonb_each_text(v_row) e
        where e.key in ('arrival_at','departure_at','actual_flight_in','actual_flight_out')
          and e.value is not null and e.value !~ '(Z|[+-][0-9]{2}:[0-9]{2})$') then
        raise exception 'Timestamps require timezone offsets' using errcode = '22023'; end if;
      v_booking := jsonb_populate_record(null::public.bookings,v_row);
      insert into public.bookings(
        code,external_id,platform,customer_name,phone,email,persons,plate,product,covered,
        arrival_at,departure_at,flight_in,flight_out,actual_flight_in,actual_flight_out,status,total,paid)
      values(
        coalesce(v_booking.code,'TVP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
        v_booking.external_id,v_booking.platform,v_booking.customer_name,v_booking.phone,v_booking.email,
        coalesce(v_booking.persons,1),v_booking.plate,v_booking.product,coalesce(v_booking.covered,false),
        v_booking.arrival_at,v_booking.departure_at,v_booking.flight_in,v_booking.flight_out,
        v_booking.actual_flight_in,v_booking.actual_flight_out,coalesce(v_booking.status,'confirmed'),
        coalesce(v_booking.total,0),coalesce(v_booking.paid,0))
      on conflict on constraint bookings_external_unique do nothing returning id into v_id;
      if v_id is null then v_skipped := v_skipped+1; else v_imported := v_imported+1; end if;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      -- No raw customer data or SQL exception detail retained in errors.
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('row',v_index,'code',v_state,
        'message',case v_state when '23505' then 'Duplicate booking code'
          when '23503' then 'Unknown product'
          when '23514' then 'Invalid booking values or date order'
          when '23502' then 'Required field missing'
          else 'Invalid row format, field or type' end));
    end;
  end loop;
  insert into public.import_log(actor_id,imported,skipped,errors)
    values(auth.uid(),v_imported,v_skipped,v_errors) returning id into v_log_id;
  return jsonb_build_object('log_id',v_log_id,'imported',v_imported,'skipped',v_skipped,'errors',v_errors);
end $$;

-- A dedicated bootstrap RPC is NOT exposed. First admin provisioning uses a trusted server key.
revoke all on function private.is_staff(),private.is_admin(),private.audit_change(),private.normalize_booking(),private.sync_profile_email() from public,anon,authenticated;
grant execute on function private.is_staff(),private.is_admin() to authenticated;
revoke all on function public.check_booking(uuid,text),public.update_booking_ops(uuid,jsonb),
  public.manage_employee(uuid,text,text,boolean),public.set_employee_role(uuid,text),public.import_bookings(jsonb) from public,anon,authenticated;
grant execute on function public.check_booking(uuid,text),public.update_booking_ops(uuid,jsonb),
  public.manage_employee(uuid,text,text,boolean),public.set_employee_role(uuid,text),public.import_bookings(jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('booking-media','booking-media',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
-- Restrictive guard prevents a future broad storage policy from accidentally exposing this bucket.
create policy tvp_media_guard on storage.objects as restrictive for all to public
using (bucket_id <> 'booking-media' or (private.is_staff() and exists(
  select 1 from public.bookings b where b.id::text = split_part(name,'/',1))))
with check (bucket_id <> 'booking-media' or (private.is_staff()
  and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9._-]{0,159}$'
  and exists(select 1 from public.bookings b where b.id::text = split_part(name,'/',1))));
create policy tvp_media_read on storage.objects for select to authenticated
using (bucket_id='booking-media' and private.is_staff());
create policy tvp_media_insert on storage.objects for insert to authenticated
with check (bucket_id='booking-media' and private.is_staff());
-- Drivers append evidence only. Overwrite/delete requires an active admin.
create policy tvp_media_update on storage.objects for update to authenticated
using (bucket_id='booking-media' and private.is_admin())
with check (bucket_id='booking-media' and private.is_admin());
create policy tvp_media_delete on storage.objects for delete to authenticated
using (bucket_id='booking-media' and private.is_admin());

-- Default prices are examples for new manual bookings, not a tariff import.
insert into public.products(code,label,covered,day_one,daily_extra,covered_extra)
values('VALET-F','Valet Freifläche',false,40,10,10),
      ('VALET-C','Valet Überdacht',true,40,10,10);
commit;
