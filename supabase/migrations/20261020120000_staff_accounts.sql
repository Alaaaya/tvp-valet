-- Staff accounts managed by admins inside the app (username + password, no e-mail inbox needed).
-- Run once in the Supabase SQL editor of the TVP production project (xblgioeurvzqeaitumdq).
-- Login: username "wael" signs in as wael@staff.tvp-valet.de (the app appends the domain).
begin;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_create_staff(
  p_username text, p_full_name text, p_password text, p_role text default 'driver'
) returns public.profiles
language plpgsql security definer set search_path = ''
as $$
declare
  v_username text := lower(trim(coalesce(p_username,'')));
  v_name text := trim(coalesce(p_full_name,''));
  v_role text := coalesce(p_role,'driver');
  v_email text;
  v_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_profile public.profiles;
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if v_username !~ '^[a-z0-9._-]{3,32}$' then
    raise exception 'Invalid username (3-32 characters: a-z, 0-9, . _ -)' using errcode = '22023'; end if;
  if length(v_name) not between 1 and 120 then
    raise exception 'Invalid name (1-120 characters)' using errcode = '22023'; end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'Password must have at least 8 characters' using errcode = '22023'; end if;
  if octet_length(p_password) > 72 then
    raise exception 'Password must not exceed 72 bytes' using errcode = '22023'; end if;
  if v_role not in ('admin','driver') then
    raise exception 'Invalid employee role' using errcode = '22023'; end if;
  v_email := v_username || '@staff.tvp-valet.de';
  perform pg_advisory_xact_lock(73418,2);
  if exists(select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'Username already exists' using errcode = '23505'; end if;

  insert into auth.users(
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values(
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), v_now,
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', v_name),
    v_now, v_now, '', '', '', '');

  -- auth.identities.email is a generated column; provider_id is required.
  insert into auth.identities(
    id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values(
    gen_random_uuid(), v_id, v_id::text, 'email',
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    v_now, v_now, v_now);

  insert into public.profiles(id, full_name, email, role, active)
    values(v_id, v_name, v_email, v_role, true)
    returning * into v_profile;
  return v_profile;
end $$;

create or replace function public.admin_set_staff_password(p_user_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if p_password is null or length(p_password) < 8 then
    raise exception 'Password must have at least 8 characters' using errcode = '22023'; end if;
  if octet_length(p_password) > 72 then
    raise exception 'Password must not exceed 72 bytes' using errcode = '22023'; end if;
  if not exists(select 1 from public.profiles where id = p_user_id) then
    raise exception 'Employee not found' using errcode = 'P0002'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
    updated_at = now() where id = p_user_id;
  if not found then raise exception 'Employee not found' using errcode = 'P0002'; end if;
end $$;

revoke all on function public.admin_create_staff(text,text,text,text) from public, anon, authenticated;
revoke all on function public.admin_set_staff_password(uuid,text) from public, anon, authenticated;
grant execute on function public.admin_create_staff(text,text,text,text) to authenticated;
grant execute on function public.admin_set_staff_password(uuid,text) to authenticated;
-- Activate/deactivate and role changes keep using public.manage_employee (last-admin guard).
notify pgrst, 'reload schema';
commit;
