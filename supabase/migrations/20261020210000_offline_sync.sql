-- Offline event ledger. No backfill, destructive DDL, or data migration.
begin;
alter table public.bookings add column sync_version bigint not null default 0 check(sync_version>=0);
create function private.advance_booking_sync_version() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then new.sync_version:=0;
 else new.sync_version:=old.sync_version+1; end if;
 return new;
end $$;
revoke all on function private.advance_booking_sync_version() from public,anon,authenticated;
create trigger zz_booking_sync_version before insert or update on public.bookings
for each row execute function private.advance_booking_sync_version();
-- Operational RPCs deliberately do not update bookings. Include those writes in
-- the booking's conflict domain as well, including legacy callers and undo resets.
create function private.advance_operations_sync_version() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.bookings set sync_version=sync_version where id=coalesce(new.booking_id,old.booking_id);
 return null;
end $$;
revoke all on function private.advance_operations_sync_version() from public,anon,authenticated;
create trigger booking_operations_sync_version after insert or update or delete on public.booking_operations
for each row execute function private.advance_operations_sync_version();

create table public.booking_sync_receipts(
 id uuid primary key,
 booking_id uuid not null references public.bookings(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 expected_version bigint not null check(expected_version>=0),
 predecessor_id uuid references public.booking_sync_receipts(id) on delete restrict,
 action text not null,
 payload jsonb not null,
 response jsonb not null,
 occurred_at timestamptz not null default clock_timestamp()
);
alter table public.booking_sync_receipts enable row level security;
revoke all on public.booking_sync_receipts from public,anon,authenticated,service_role;
-- Ledger is only accessible through actor-bound replay. Even admin REST cannot mutate it.
create trigger booking_sync_receipts_immutable before update or delete on public.booking_sync_receipts
for each row execute function private.immutable_booking_detail_receipt();
create trigger booking_sync_receipts_audit after insert on public.booking_sync_receipts
for each row execute function private.audit_change();

-- Standalone photos are not handovers. Deferred FK commits links and receipt atomically.
create table public.booking_gallery_media(
 id uuid primary key,
 event_id uuid not null references public.booking_sync_receipts(id) on delete restrict deferrable initially deferred,
 booking_id uuid not null references public.bookings(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 path text not null unique,
 kind text not null default 'photo' check(kind='photo'),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 size_bytes bigint not null check(size_bytes between 1 and 10485760),
 captured_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp()
);
create index booking_gallery_media_booking_idx on public.booking_gallery_media(booking_id,created_at);
alter table public.booking_gallery_media enable row level security;
revoke all on public.booking_gallery_media from public,anon,authenticated,service_role;
grant select on public.booking_gallery_media to authenticated;
create policy booking_gallery_media_staff_read on public.booking_gallery_media for select to authenticated
 using((select private.is_staff()) and exists(select 1 from public.bookings b where b.id=booking_id));
create trigger booking_gallery_media_immutable before update or delete on public.booking_gallery_media
for each row execute function private.immutable_booking_detail_receipt();
create trigger booking_gallery_media_audit after insert on public.booking_gallery_media
for each row execute function private.audit_change();

create function public.sync_booking_event(
 p_event_id uuid,p_booking_id uuid,p_expected_version bigint,p_action text,p_payload jsonb,p_predecessor_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.bookings;r public.booking_sync_receipts;pre public.booking_sync_receipts;allowed text[];baseline bigint;
 result jsonb;response jsonb;ops jsonb;rev bigint;lock_seed bigint;collision boolean;effective jsonb;snapshot jsonb;canonical jsonb;item jsonb;metadata jsonb;photo_id uuid;photo_path text;photo_mime text;photo_size bigint;photo_at timestamptz;
begin
 if auth.uid() is null or not private.is_staff() then
  raise exception 'Active staff required' using errcode='42501'; end if;
 if p_event_id is null or p_booking_id is null or p_expected_version is null or p_expected_version<0
 or p_action is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then
  raise exception 'Invalid offline event' using errcode='22023'; end if;
 -- UUID lock globally serializes re-use, even across different bookings/actors.
 perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,20261020));
 select * into r from public.booking_sync_receipts where id=p_event_id;
 if found then
  if r.actor_id<>auth.uid() or r.booking_id<>p_booking_id or r.expected_version<>p_expected_version
   or r.action<>p_action or r.payload<>p_payload or r.predecessor_id is distinct from p_predecessor_id then
   raise exception 'Event identity/context mismatch' using errcode='23514'; end if;
  return r.response;
 end if;
 -- Payload has exactly the explicitly named fields. No client role, actor,
 -- booking/request ID, arbitrary SQL, or generic function name is accepted.
 allowed:=case p_action
  when 'payment' then array['amount_cents','method','expected_paid_cents','expected_total_cents']
  when 'customer_call' then array['expected_called_at','expected_checked_out_at','expected_lifecycle_revision','allow_repeat']
  when 'clear_customer_call' then array['expected_called_at','expected_lifecycle_revision']
  when 'handover' then array['action','details','media','expected_in','expected_out','expected_revision']
  when 'undo_handover' then array['action','expected_at']
  when 'detail' then array['action','target','expected']
  when 'safe_edit' then array['patch','expected']
  when 'operation' then array['action']
  when 'update_ops' then array['patch']
  when 'media_append' then array['media']
  else null end;
 if allowed is null or not(p_payload ?& allowed)
 or exists(select 1 from jsonb_object_keys(p_payload) k where not(k=any(allowed))) then
  raise exception 'Unknown action or invalid payload fields' using errcode='22023'; end if;
 -- Match underlying RPC lock ordering before taking its booking lock. A UUID
 -- already used directly must not be adopted as a new wrapper success.
 lock_seed:=case p_action when 'payment' then 172200 when 'customer_call' then 172300
  when 'clear_customer_call' then 172301 when 'handover' then 170017
  when 'undo_handover' then 170017 when 'detail' then 172100 when 'safe_edit' then 172400 else null end;
 if lock_seed is not null then perform pg_advisory_xact_lock(hashtextextended(p_event_id::text,lock_seed)); end if;
 collision:=case p_action
  when 'payment' then exists(select 1 from public.booking_payments where id=p_event_id)
  when 'customer_call' then exists(select 1 from public.booking_customer_call_receipts where id=p_event_id)
  when 'clear_customer_call' then exists(select 1 from public.booking_customer_call_clear_receipts where id=p_event_id)
  when 'handover' then exists(select 1 from public.booking_handovers where id=p_event_id)
  when 'undo_handover' then exists(select 1 from public.booking_handover_undos where id=p_event_id)
  when 'detail' then exists(select 1 from public.booking_detail_action_receipts where id=p_event_id)
  when 'safe_edit' then exists(select 1 from public.booking_edit_receipts where id=p_event_id)
  else false end;
 if collision then raise exception 'Event ID already used outside sync' using errcode='23514'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'Booking not found' using errcode='P0002'; end if;
 baseline:=p_expected_version;
 if p_predecessor_id is not null then
  select * into pre from public.booking_sync_receipts where id=p_predecessor_id;
  if not found or pre.actor_id<>auth.uid() or pre.booking_id<>p_booking_id
   or (p_expected_version<>pre.expected_version and p_expected_version<>(pre.response->>'version')::bigint) then
   raise exception 'Invalid or unresolved predecessor' using errcode='PT409'; end if;
  baseline:=(pre.response->>'version')::bigint;
 end if;
 if b.sync_version<>baseline then
  raise exception 'Booking changed; review before retry' using errcode='PT409'; end if;
 -- Preserve ORIGINAL payload in receipt identity, but derive expected fields only
 -- from the immutable predecessor canonical response after its version matches.
 effective:=p_payload;
 if p_predecessor_id is not null then
  canonical:=pre.response->'booking';
  snapshot:=jsonb_build_object('status',canonical->'status',
   'checked_in_at',canonical->'checked_in_at','checked_out_at',canonical->'checked_out_at',
   'spot',coalesce(canonical->>'spot',''),'detail_revision',canonical->'detail_revision',
   'lifecycle_revision',pre.response->'lifecycle_revision');
  case p_action
  when 'payment' then effective:=effective||jsonb_build_object(
   'expected_paid_cents',((canonical->>'paid')::numeric*100),
   'expected_total_cents',((canonical->>'total')::numeric*100));
  when 'customer_call' then effective:=effective||jsonb_build_object(
   'expected_called_at',pre.response#>'{operations,customer_called_at}',
   'expected_checked_out_at',canonical->'checked_out_at',
   'expected_lifecycle_revision',pre.response->'lifecycle_revision');
  when 'clear_customer_call' then effective:=effective||jsonb_build_object(
   'expected_called_at',pre.response#>'{operations,customer_called_at}',
   'expected_lifecycle_revision',pre.response->'lifecycle_revision');
  when 'handover' then effective:=effective||jsonb_build_object(
   'expected_in',canonical->'checked_in_at','expected_out',canonical->'checked_out_at',
   'expected_revision',pre.response->'lifecycle_revision');
  when 'undo_handover' then effective:=effective||jsonb_build_object(
   'expected_at',case when p_payload->>'action'='in' then canonical->'checked_in_at'
    else canonical->'checked_out_at' end);
  when 'detail' then effective:=effective||jsonb_build_object('expected',snapshot);
  when 'safe_edit' then effective:=effective||jsonb_build_object('expected',
   snapshot||jsonb_build_object('edit_revision',canonical->'edit_revision'));
  else null;
  end case;
 end if;
 -- Call existing APIs with their own auth, lifecycle, field, money and media guards.
 case p_action
 when 'payment' then
  result:=to_jsonb(public.record_booking_payment(p_event_id,p_booking_id,
   (effective->>'amount_cents')::numeric,effective->>'method',
   (effective->>'expected_paid_cents')::numeric,(effective->>'expected_total_cents')::numeric));
 when 'customer_call' then
  result:=public.record_booking_customer_call(p_event_id,p_booking_id,
   (effective->>'expected_called_at')::timestamptz,(effective->>'expected_checked_out_at')::timestamptz,
   (effective->>'expected_lifecycle_revision')::bigint,(effective->>'allow_repeat')::boolean);
 when 'clear_customer_call' then
  result:=public.clear_booking_customer_call(p_event_id,p_booking_id,
   (effective->>'expected_called_at')::timestamptz,(effective->>'expected_lifecycle_revision')::bigint);
 when 'handover' then
  result:=to_jsonb(public.complete_booking_handover(p_event_id,p_booking_id,effective->>'action',
   effective->'details',effective->'media',(effective->>'expected_in')::timestamptz,
   (effective->>'expected_out')::timestamptz,(effective->>'expected_revision')::bigint));
 when 'undo_handover' then
  result:=to_jsonb(public.undo_booking_handover(p_event_id,p_booking_id,effective->>'action',
   (effective->>'expected_at')::timestamptz));
 when 'detail' then
  result:=to_jsonb(public.apply_booking_detail_action(p_event_id,p_booking_id,effective->>'action',
   effective->>'target',effective->'expected'));
 when 'safe_edit' then
  result:=public.apply_booking_safe_edit(p_event_id,p_booking_id,effective->'patch',effective->'expected');
 when 'operation' then
  if effective->>'action' is null or effective->>'action' not in ('taken_away','retrieved','ride_started') then
   raise exception 'Use dedicated customer_call event' using errcode='22023'; end if;
  result:=to_jsonb(public.record_booking_operation(p_booking_id,effective->>'action'));
 when 'media_append' then
  if jsonb_typeof(effective->'media') is distinct from 'array'
   or jsonb_array_length(effective->'media') not between 1 and 40 then
   raise exception 'Expected 1 to 40 gallery photos' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(effective->'media') loop
   if jsonb_typeof(item)<>'object' then raise exception 'Invalid photo' using errcode='22023'; end if;
   if not(item ?& array['id','path','kind','mime_type','captured_at','size_bytes'])
    or exists(select 1 from jsonb_object_keys(item) k where k not in
     ('id','path','kind','mime_type','captured_at','size_bytes'))
    or exists(select 1 from jsonb_each(item) e where
     (e.key='size_bytes' and jsonb_typeof(e.value)<>'number')
     or (e.key<>'size_bytes' and jsonb_typeof(e.value)<>'string')) then
    raise exception 'Invalid gallery photo fields' using errcode='22023'; end if;
   photo_id:=(item->>'id')::uuid;photo_path:=item->>'path';photo_mime:=item->>'mime_type';
   if item->>'kind'<>'photo' or photo_mime not in ('image/jpeg','image/png','image/webp')
    or photo_path !~ ('^'||p_booking_id::text||'/'||p_event_id::text||'-'||photo_id::text||'[.][A-Za-z0-9]{1,10}$')
    or (item->>'size_bytes')::numeric<>trunc((item->>'size_bytes')::numeric)
    or (item->>'size_bytes')::numeric not between 1 and 10485760 then
    raise exception 'Invalid gallery MIME, path or size' using errcode='22023'; end if;
   photo_size:=(item->>'size_bytes')::bigint;
   if item->>'captured_at' !~ '^\d{4}-\d{2}-\d{2}T.+(Z|[+-]\d{2}:\d{2})$' then
    raise exception 'Photo timestamp requires timezone' using errcode='22023'; end if;
   photo_at:=(item->>'captured_at')::timestamptz;
   if not isfinite(photo_at) or photo_at>clock_timestamp()+interval '5 minutes' then
    raise exception 'Invalid photo timestamp' using errcode='22023'; end if;
   select o.metadata into metadata from storage.objects o
    where o.bucket_id='booking-media' and o.name=photo_path
     and o.owner_id=auth.uid()::text for share;
   if not found then raise exception 'Uploaded photo missing' using errcode='23514'; end if;
   if metadata->>'size' is null or metadata->>'mimetype' is null
    or (metadata->>'size')::numeric<>photo_size
    or lower(trim(split_part(metadata->>'mimetype',';',1)))<>photo_mime then
    raise exception 'Uploaded photo metadata mismatch' using errcode='23514'; end if;
   insert into public.booking_gallery_media(id,event_id,booking_id,actor_id,path,mime_type,size_bytes,captured_at)
    values(photo_id,p_event_id,p_booking_id,auth.uid(),photo_path,photo_mime,photo_size,photo_at);
  end loop;
  update public.bookings set sync_version=sync_version where id=p_booking_id;
  select jsonb_build_object('media',jsonb_agg(to_jsonb(g) order by g.id)) into result
   from public.booking_gallery_media g where event_id=p_event_id;
 when 'update_ops' then
  result:=to_jsonb(public.update_booking_ops(p_booking_id,effective->'patch'));
 end case;
 -- Reload after triggers. Result returned by an existing RPC may predate nested triggers.
 select * into b from public.bookings where id=p_booking_id;
 select to_jsonb(o) into ops from public.booking_operations o where booking_id=p_booking_id;
 select count(*) into rev from public.booking_handover_undos where booking_id=p_booking_id;
 response:=jsonb_build_object('event_id',p_event_id,'booking_id',p_booking_id,
  'version',b.sync_version,'result',result,'booking',to_jsonb(b)||jsonb_build_object('lifecycle_revision',rev),'operations',ops,'lifecycle_revision',rev);
 insert into public.booking_sync_receipts(id,booking_id,actor_id,expected_version,predecessor_id,action,payload,response)
 values(p_event_id,p_booking_id,auth.uid(),p_expected_version,p_predecessor_id,p_action,p_payload,response);
 return response;
end $$;
revoke all on function public.sync_booking_event(uuid,uuid,bigint,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.sync_booking_event(uuid,uuid,bigint,text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
