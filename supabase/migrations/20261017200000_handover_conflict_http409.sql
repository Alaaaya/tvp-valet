-- Business conflicts must not trigger PostgREST serialization retries.
-- No booking, media, receipt, audit or privilege changes.
begin;
create or replace function public.undo_booking_handover(
  p_request_id uuid,p_booking_id uuid,p_action text,p_expected_at timestamptz
) returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare
  v_booking public.bookings; v_old jsonb; v_receipt public.booking_handover_undos;
  v_handover uuid; v_now timestamptz;
begin
  if not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
  if p_request_id is null or p_booking_id is null or p_action is null or p_action not in ('in','out')
    or p_expected_at is null or not isfinite(p_expected_at) then
    raise exception 'Invalid undo identity, action or timestamp' using errcode='22023'; end if;
  -- Same global request lock as completion; booking lock serializes lifecycle changes.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,170017));
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found' using errcode='P0002'; end if;
  select * into v_receipt from public.booking_handover_undos where id=p_request_id;
  if found then
    if v_receipt.booking_id <> p_booking_id or v_receipt.action <> p_action
      or v_receipt.expected_at <> p_expected_at or v_receipt.actor_id <> auth.uid() then
      raise exception 'Undo request context mismatch' using errcode='23514'; end if;
    return v_booking;
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Booking is not confirmed' using errcode='23514'; end if;
  if p_action='in' and v_booking.checked_out_at is not null then
    raise exception 'Undo checkout before checkin' using errcode='23514'; end if;
  if (case when p_action='in' then v_booking.checked_in_at else v_booking.checked_out_at end)
    is distinct from p_expected_at then
    raise exception 'Booking changed; reload before undo' using errcode='PT409'; end if;
  v_old := to_jsonb(v_booking);
  v_now := clock_timestamp();
  update public.booking_handovers set undone_at=v_now,undone_by=auth.uid()
    where booking_id=p_booking_id and action=p_action and undone_at is null
    returning id into v_handover;
  -- Derived state becomes checked-in (undo out) or expected (undo in).
  -- status remains confirmed; all details, photos and signatures are retained.
  update public.bookings set
    checked_in_at=case when p_action='in' then null else checked_in_at end,
    checked_out_at=case when p_action='out' then null else checked_out_at end
    where id=p_booking_id returning * into v_booking;
  insert into public.booking_handover_undos
    (id,booking_id,action,expected_at,handover_id,actor_id,occurred_at,old_data,new_data)
    values(p_request_id,p_booking_id,p_action,p_expected_at,v_handover,auth.uid(),v_now,v_old,to_jsonb(v_booking));
  return v_booking;
end $$;

create or replace function private.complete_booking_handover_core(
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
    if v_existing.undone_at is not null then
      raise exception 'Handover was undone; use a new request' using errcode='PT409'; end if;
    -- Return current booking before inspecting mutable draft data on a retry.
    return v_booking;
  end if;
  if exists(select 1 from public.booking_handovers where booking_id=p_booking_id and action=p_action and undone_at is null)
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

create or replace function public.complete_booking_handover(
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
    raise exception 'Lifecycle revision changed; reopen handover' using errcode='PT409'; end if;
  if v_booking.checked_in_at is distinct from p_expected_in
    or v_booking.checked_out_at is distinct from p_expected_out then
    raise exception 'Lifecycle changed; reopen handover' using errcode='PT409'; end if;
  return private.complete_booking_handover_core(p_request_id,p_booking_id,p_action,p_details,p_media);
end $$;
commit;
