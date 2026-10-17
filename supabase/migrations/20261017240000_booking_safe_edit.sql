-- Narrow existing-booking edit. No backfill, deployment or client-controlled revisions.
begin;
alter table public.bookings add column edit_revision bigint not null default 0 check(edit_revision>=0);
create function private.advance_booking_edit_revision() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then new.edit_revision:=0;
 else new.edit_revision:=old.edit_revision+case when
 ROW(new.customer_name,new.first_name,new.last_name,new.car_description,new.phone,new.email,new.persons,new.plate,new.km,new.key_cash,new.comment,new.arrival_at,new.departure_at,new.flight_in,new.flight_out) is distinct from ROW(old.customer_name,old.first_name,old.last_name,old.car_description,old.phone,old.email,old.persons,old.plate,old.km,old.key_cash,old.comment,old.arrival_at,old.departure_at,old.flight_in,old.flight_out) then 1 else 0 end;
 end if;
 return new;
end $$;
revoke all on function private.advance_booking_edit_revision() from public,anon,authenticated;
create trigger bookings_edit_revision before insert or update on public.bookings
for each row execute function private.advance_booking_edit_revision();
create table public.booking_edit_receipts(
 id uuid primary key,booking_id uuid not null references public.bookings(id) on delete restrict,
 actor_id uuid not null references public.profiles(id),patch jsonb not null,expected jsonb not null,
 before_data jsonb not null,after_data jsonb not null,occurred_at timestamptz not null default clock_timestamp()
);
alter table public.booking_edit_receipts enable row level security;
revoke all on public.booking_edit_receipts from public,anon,authenticated,service_role;
grant select on public.booking_edit_receipts to authenticated,service_role;
create policy booking_edit_admin_read on public.booking_edit_receipts for select to authenticated using ((select private.is_admin()));
create trigger booking_edit_immutable before update or delete on public.booking_edit_receipts
for each row execute function private.immutable_booking_detail_receipt();
create trigger booking_edit_audit after insert on public.booking_edit_receipts
for each row execute function private.audit_change();

create function public.apply_booking_safe_edit(p_request_id uuid,p_booking_id uuid,p_patch jsonb,p_expected jsonb)
returns public.bookings language plpgsql security definer set search_path='' as $$
declare b public.bookings;n public.bookings;r public.booking_edit_receipts;k text;v jsonb;rev bigint;before_snapshot jsonb;
begin
 if not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
 if p_request_id is null or p_booking_id is null or p_patch is null or jsonb_typeof(p_patch)<>'object'
 or p_patch='{}'::jsonb or p_expected is null or jsonb_typeof(p_expected)<>'object'
 or not(p_expected ?& array['edit_revision','lifecycle_revision','detail_revision','status','checked_in_at','checked_out_at','spot'])
 or exists(select 1 from jsonb_object_keys(p_expected) x where x not in
 ('edit_revision','lifecycle_revision','detail_revision','status','checked_in_at','checked_out_at','spot'))
 then raise exception 'Invalid edit context' using errcode='22023'; end if;
 for k,v in select * from jsonb_each(p_patch) loop
  if k not in ('customer_name','first_name','last_name','car_description','phone','email','persons','plate','km','key_cash','comment','arrival_at','departure_at','flight_in','flight_out') then raise exception 'Field not editable' using errcode='22023'; end if;
  if not private.is_admin() and k not in ('km','key_cash','comment') then raise exception 'Admin required' using errcode='42501'; end if;
  if k in ('persons','km') then
   if not(k='km' and v='null'::jsonb) and (jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]+$') then
    raise exception 'Invalid integer' using errcode='22023'; end if;
  elsif v<>'null'::jsonb and jsonb_typeof(v)<>'string' then raise exception 'Invalid text' using errcode='22023';
  end if;
  if k in ('customer_name','persons','arrival_at','departure_at') and v='null'::jsonb then
   raise exception 'Required field' using errcode='22023'; end if;
 end loop;
 foreach k in array array['edit_revision','lifecycle_revision','detail_revision'] loop
  if jsonb_typeof(p_expected->k)<>'number' or (p_expected->>k) !~ '^[0-9]+$' then raise exception 'Invalid revision' using errcode='22023'; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,172400));
 select * into b from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'Booking not found' using errcode='P0002'; end if;
 select * into r from public.booking_edit_receipts where id=p_request_id;
 if found then
  if r.actor_id<>auth.uid() or r.booking_id<>p_booking_id or r.patch<>p_patch or r.expected<>p_expected then
   raise exception 'Request context mismatch' using errcode='23514'; end if;
  -- Return current server row; original immutable before/after snapshots remain in receipt.
  return b;
 end if;
 select count(*) into rev from public.booking_handover_undos where booking_id=p_booking_id;
 if (p_expected->>'edit_revision')::bigint is distinct from b.edit_revision
 or (p_expected->>'detail_revision')::bigint is distinct from b.detail_revision
 or (p_expected->>'lifecycle_revision')::bigint is distinct from rev
 or (p_expected->>'status') is distinct from b.status
 or (p_expected->>'checked_in_at')::timestamptz is distinct from b.checked_in_at
 or (p_expected->>'checked_out_at')::timestamptz is distinct from b.checked_out_at
 or coalesce(p_expected->>'spot','') is distinct from coalesce(b.spot,'')
 then raise exception 'Booking changed; reload' using errcode='PT409'; end if;
 n:=jsonb_populate_record(b,p_patch);
 if not isfinite(n.arrival_at) or not isfinite(n.departure_at) or n.departure_at<n.arrival_at
 then raise exception 'Invalid dates' using errcode='22023'; end if;
 if (p_patch ? 'plate' and length(trim(coalesce(n.plate,'')))=0)
 or (p_patch ? 'customer_name' and length(trim(n.customer_name))=0)
 then raise exception 'Empty identity' using errcode='22023'; end if;
 before_snapshot:=to_jsonb(b);
 update public.bookings set customer_name=n.customer_name,first_name=n.first_name,last_name=n.last_name,car_description=n.car_description,phone=n.phone,email=n.email,persons=n.persons,plate=n.plate,km=n.km,key_cash=n.key_cash,comment=n.comment,arrival_at=n.arrival_at,departure_at=n.departure_at,flight_in=n.flight_in,flight_out=n.flight_out where id=p_booking_id returning * into b;
 insert into public.booking_edit_receipts(id,booking_id,actor_id,patch,expected,before_data,after_data)
 values(p_request_id,p_booking_id,auth.uid(),p_patch,p_expected,before_snapshot,to_jsonb(b));
 return b;
end $$;
revoke all on function public.apply_booking_safe_edit(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.apply_booking_safe_edit(uuid,uuid,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
