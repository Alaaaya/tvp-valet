-- Atomic handover completion. Uploads remain private; uncommitted drafts may be cleaned by service_role.
begin;
create table public.booking_handovers (
  id uuid primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  action text not null check (action in ('in','out')),
  details jsonb not null check (jsonb_typeof(details)='object'),
  performed_by uuid not null references public.profiles(id),
  completed_at timestamptz not null default clock_timestamp(),
  unique (booking_id,action),
  unique (id,booking_id,action)
);
create table public.booking_media (
  id uuid primary key,
  path text not null unique,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  request_id uuid not null,
  action text not null check (action in ('in','out')),
  kind text not null check (kind in ('photo','video','signature')),
  mime_type text not null,
  captured_at timestamptz not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (request_id,booking_id,action)
    references public.booking_handovers(id,booking_id,action) on delete cascade
);
create index booking_media_booking_idx on public.booking_media(booking_id,created_at);
alter table public.booking_handovers enable row level security;
alter table public.booking_media enable row level security;
revoke all on public.booking_handovers,public.booking_media from public,anon,authenticated;
grant select on public.booking_handovers,public.booking_media to authenticated;
grant all on public.booking_handovers,public.booking_media to service_role;
create policy booking_handovers_staff_read on public.booking_handovers for select to authenticated
  using ((select private.is_staff()));
create policy booking_media_staff_read on public.booking_media for select to authenticated
  using ((select private.is_staff()));
create trigger booking_handovers_audit after insert or update or delete on public.booking_handovers
  for each row execute function private.audit_change();
create trigger booking_media_audit after insert or update or delete on public.booking_media
  for each row execute function private.audit_change();

create function public.complete_booking_handover(
  p_request_id uuid,p_booking_id uuid,p_action text,
  p_details jsonb default '{}'::jsonb,p_media jsonb default '[]'::jsonb
) returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking public.bookings; v_existing public.booking_handovers;
  v_item jsonb; v_id uuid; v_path text; v_kind text; v_mime text;
  v_captured timestamptz; v_size bigint; v_metadata jsonb;
  v_count integer := 0; v_signatures integer := 0; v_comment text;
begin
  if not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_request_id is null or p_booking_id is null or p_action is null or p_action not in ('in','out') then
    raise exception 'Invalid handover identity or action' using errcode='22023'; end if;
  -- Serialize the request globally, including attempts to reuse it against a different booking.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,170017));
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found' using errcode='P0002'; end if;
  select * into v_existing from public.booking_handovers where id=p_request_id;
  if found then
    if v_existing.booking_id <> p_booking_id or v_existing.action <> p_action then
      raise exception 'Request already belongs to another handover' using errcode='23514'; end if;
    -- Return current booking before inspecting mutable draft data on a retry.
    return v_booking;
  end if;
  if exists(select 1 from public.booking_handovers where booking_id=p_booking_id and action=p_action)
    or (p_action='in' and v_booking.checked_in_at is not null)
    or (p_action='out' and v_booking.checked_out_at is not null) then
    raise exception 'Handover already completed' using errcode='23514'; end if;
  if p_details is null or jsonb_typeof(p_details) <> 'object' then
    raise exception 'Details must be an object' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_details) k
    where k not in ('km','key_cash','flight_number','comment','poor_visibility')) then
    raise exception 'Forbidden detail field' using errcode='22023'; end if;
  if exists(select 1 from jsonb_each(p_details) e where
    (e.key='km' and jsonb_typeof(e.value) not in ('number','null'))
    or (e.key in ('key_cash','flight_number','comment') and jsonb_typeof(e.value)<>'string')
    or (e.key='poor_visibility' and jsonb_typeof(e.value)<>'boolean')) then
    raise exception 'Invalid detail type' using errcode='22023'; end if;
  if p_details->>'km' is not null and (
    (p_details->>'km')::numeric < 0 or (p_details->>'km')::numeric > 2147483647
    or trunc((p_details->>'km')::numeric) <> (p_details->>'km')::numeric) then
    raise exception 'Invalid odometer' using errcode='22023'; end if;
  if coalesce(length(p_details->>'key_cash'),0)>200
    or coalesce(length(p_details->>'flight_number'),0)>40
    or coalesce(length(p_details->>'comment'),0)>10000 then
    raise exception 'Detail too long' using errcode='22023'; end if;
  v_comment := v_booking.comment;
  if coalesce(trim(p_details->>'comment'),'') <> '' then
    v_comment := concat_ws(E'\n',nullif(v_comment,''),p_details->>'comment');
  end if;
  if coalesce(length(v_comment),0)>10000 then
    raise exception 'Combined comment too long' using errcode='22023'; end if;
  if p_media is null or jsonb_typeof(p_media)<>'array' then
    raise exception 'Media must be an array' using errcode='22023'; end if;
  if jsonb_array_length(p_media)>41 then raise exception 'Too many media files' using errcode='22023'; end if;
  insert into public.booking_handovers(id,booking_id,action,details,performed_by)
    values(p_request_id,p_booking_id,p_action,p_details,auth.uid());
  for v_item in select value from jsonb_array_elements(p_media) loop
    if jsonb_typeof(v_item)<>'object' then raise exception 'Invalid media object' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(v_item) k where k not in
      ('id','path','kind','mime_type','captured_at','size_bytes'))
      or not (v_item ?& array['id','path','kind','mime_type','captured_at','size_bytes'])
      or exists(select 1 from jsonb_each(v_item) e where
        (e.key='size_bytes' and jsonb_typeof(e.value)<>'number')
        or (e.key<>'size_bytes' and jsonb_typeof(e.value)<>'string')) then
      raise exception 'Invalid media fields' using errcode='22023'; end if;
    v_id := (v_item->>'id')::uuid;
    v_path := v_item->>'path'; v_kind := v_item->>'kind'; v_mime := v_item->>'mime_type';
    if v_kind not in ('photo','video','signature') then raise exception 'Invalid media kind' using errcode='22023'; end if;
    if v_kind='signature' then v_signatures:=v_signatures+1; else v_count:=v_count+1; end if;
    if v_signatures>1 or v_count>40 then raise exception 'Too many media files' using errcode='22023'; end if;
    if (v_kind='photo' and v_mime not in ('image/jpeg','image/png','image/webp'))
      or (v_kind='video' and v_mime not in ('video/mp4','video/webm','video/quicktime'))
      or (v_kind='signature' and v_mime<>'image/png') then
      raise exception 'Invalid media MIME' using errcode='22023'; end if;
    -- A single filename and canonical UUIDs; no directory traversal or unrelated upload.
    if v_path !~ ('^' || p_booking_id::text || '/' || p_request_id::text || '-' || v_id::text || '[.][A-Za-z0-9]{1,10}$') then
      raise exception 'Invalid media path' using errcode='22023'; end if;
    if (v_item->>'size_bytes')::numeric <> trunc((v_item->>'size_bytes')::numeric)
      or (v_item->>'size_bytes')::numeric <= 0
      or (v_item->>'size_bytes')::numeric > (case when v_kind='video' then 52428800 else 10485760 end) then
      raise exception 'Invalid media size' using errcode='22023'; end if;
    v_size := (v_item->>'size_bytes')::bigint;
    if v_item->>'captured_at' !~ '^\d{4}-\d{2}-\d{2}T.+(Z|[+-]\d{2}:\d{2})$' then
      raise exception 'Capture timestamp requires ISO timezone' using errcode='22023'; end if;
    v_captured := (v_item->>'captured_at')::timestamptz;
    if not isfinite(v_captured) or v_captured>clock_timestamp()+interval '5 minutes' then
      raise exception 'Invalid capture timestamp' using errcode='22023'; end if;
    select metadata into v_metadata from storage.objects
      where bucket_id='booking-media' and name=v_path for share;
    if not found then raise exception 'Uploaded media missing' using errcode='23514'; end if;
    if v_metadata->>'size' is null or v_metadata->>'mimetype' is null
      or (v_metadata->>'size')::numeric <> v_size
      or lower(trim(split_part(v_metadata->>'mimetype',';',1))) <> v_mime then
      raise exception 'Uploaded media metadata mismatch' using errcode='23514'; end if;
    insert into public.booking_media(id,path,booking_id,request_id,action,kind,mime_type,captured_at,size_bytes)
      values(v_id,v_path,p_booking_id,p_request_id,p_action,v_kind,v_mime,v_captured,v_size);
  end loop;
  update public.bookings set
    km=case when p_details ? 'km' then ((p_details->>'km')::numeric)::integer else km end,
    key_cash=case when p_details ? 'key_cash' then p_details->>'key_cash' else key_cash end,
    flight_in=case when p_action='in' and p_details ? 'flight_number' then p_details->>'flight_number' else flight_in end,
    flight_out=case when p_action='out' and p_details ? 'flight_number' then p_details->>'flight_number' else flight_out end,
    comment=v_comment
    where id=p_booking_id;
  -- Existing strict lifecycle validation happens last. Any failure rolls back every insert/update above.
  return public.check_booking(p_booking_id,p_action);
end $$;
revoke all on function public.complete_booking_handover(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.complete_booking_handover(uuid,uuid,text,jsonb,jsonb) to authenticated;

update storage.buckets set public=false,file_size_limit=52428800,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm','video/quicktime']
  where id='booking-media';
commit;
