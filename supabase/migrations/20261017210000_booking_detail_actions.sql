-- Additive, no booking backfill. All action state comes from a locked row.
begin;
create table public.booking_detail_action_receipts (
 id uuid primary key,
 booking_id uuid not null references public.bookings(id) on delete restrict,
 actor_id uuid not null references public.profiles(id),
 action text not null check (action in ('status','spot')),
 target text not null,
 expected jsonb not null,
 occurred_at timestamptz not null default clock_timestamp()
);
alter table public.booking_detail_action_receipts enable row level security;
revoke all on public.booking_detail_action_receipts from public,anon,authenticated,service_role;
grant select on public.booking_detail_action_receipts to authenticated,service_role;
create policy booking_detail_receipts_admin_read on public.booking_detail_action_receipts
 for select to authenticated using ((select private.is_admin()));
create function private.immutable_booking_detail_receipt() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Action receipts are immutable' using errcode='42501'; end $$;
revoke all on function private.immutable_booking_detail_receipt() from public,anon,authenticated;
create trigger booking_detail_receipts_immutable before update or delete on public.booking_detail_action_receipts
 for each row execute function private.immutable_booking_detail_receipt();
create trigger booking_detail_receipts_audit after insert on public.booking_detail_action_receipts
 for each row execute function private.audit_change();

create function public.apply_booking_detail_action(
 p_request_id uuid,p_booking_id uuid,p_action text,p_target text,p_expected jsonb
) returns public.bookings language plpgsql security definer set search_path='' as $$
declare v_booking public.bookings; v_receipt public.booking_detail_action_receipts;
 v_revision bigint;
begin
 if not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
 if p_action='status' and not private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_request_id is null or p_booking_id is null or p_action is null or p_action not in ('status','spot')
  or p_target is null or p_expected is null or jsonb_typeof(p_expected)<>'object'
  or not (p_expected ?& array['status','checked_in_at','checked_out_at','spot','lifecycle_revision'])
  or exists(select 1 from jsonb_object_keys(p_expected) k where k not in ('status','checked_in_at','checked_out_at','spot','lifecycle_revision'))
 then raise exception 'Invalid action context' using errcode='22023'; end if;
 if (p_action='status' and p_target not in ('no_show','cancelled'))
  or (p_action='spot' and (length(trim(p_target)) not between 1 and 100 or p_target<>trim(p_target)))
 then raise exception 'Invalid target' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,172100));
 select * into v_booking from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'Booking not found' using errcode='P0002'; end if;
 select * into v_receipt from public.booking_detail_action_receipts where id=p_request_id;
 if found then
  if v_receipt.booking_id<>p_booking_id or v_receipt.actor_id<>auth.uid()
   or v_receipt.action<>p_action or v_receipt.target<>p_target or v_receipt.expected<>p_expected
  then raise exception 'Request context mismatch' using errcode='23514'; end if;
  return v_booking;
 end if;
 select count(*) into v_revision from public.booking_handover_undos where booking_id=p_booking_id;
 if (p_expected->>'status') is distinct from v_booking.status
  or (p_expected->>'checked_in_at')::timestamptz is distinct from v_booking.checked_in_at
  or (p_expected->>'checked_out_at')::timestamptz is distinct from v_booking.checked_out_at
  or coalesce(p_expected->>'spot','') is distinct from coalesce(v_booking.spot,'')
  or (p_expected->>'lifecycle_revision')::bigint is distinct from v_revision
 then raise exception 'Booking changed; reload' using errcode='40001'; end if;
 if v_booking.status<>'confirmed' then raise exception 'Booking is not confirmed' using errcode='23514'; end if;
 if p_action='status' then
  if v_booking.checked_in_at is not null or v_booking.checked_out_at is not null then
   raise exception 'Undo handover explicitly before changing status' using errcode='23514'; end if;
  update public.bookings set status=p_target where id=p_booking_id returning * into v_booking;
 else
  if v_booking.checked_out_at is not null then raise exception 'Vehicle already checked out' using errcode='23514'; end if;
  if coalesce(v_booking.spot,'')=p_target then raise exception 'Location unchanged' using errcode='22023'; end if;
  update public.bookings set spot=p_target where id=p_booking_id returning * into v_booking;
 end if;
 insert into public.booking_detail_action_receipts(id,booking_id,actor_id,action,target,expected)
  values(p_request_id,p_booking_id,auth.uid(),p_action,p_target,p_expected);
 -- Return a lifecycle revision alongside the row through the client, not a mutable booking column.
 return v_booking;
end $$;
revoke all on function public.apply_booking_detail_action(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_booking_detail_action(uuid,uuid,text,text,jsonb) to authenticated;

-- Only location and actor identity are projected, never whole customer audit snapshots.
create function public.booking_location_history(p_booking_id uuid)
returns table(id bigint,occurred_at timestamptz,actor_id uuid,actor_name text,old_spot text,new_spot text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
 if not exists(select 1 from public.bookings where bookings.id=p_booking_id) then
  raise exception 'Booking not found' using errcode='P0002'; end if;
 return query select a.id,a.created_at,a.actor_id,p.full_name,a.old_data->>'spot',a.new_data->>'spot'
  from public.audit_log a left join public.profiles p on p.id=a.actor_id
  where a.entity='bookings' and a.entity_id=p_booking_id::text
   and a.action in ('INSERT','UPDATE')
   and nullif(a.old_data->>'spot','') is distinct from nullif(a.new_data->>'spot','')
  order by a.created_at,a.id;
end $$;
create function public.booking_call_history(p_booking_id uuid)
returns table(id bigint,occurred_at timestamptz,actor_id uuid,actor_name text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
 if not exists(select 1 from public.bookings where bookings.id=p_booking_id) then
  raise exception 'Booking not found' using errcode='P0002'; end if;
 return query select e.id,e.occurred_at,e.actor_id,p.full_name
  from public.booking_operation_events e left join public.profiles p on p.id=e.actor_id
  where e.booking_id=p_booking_id and e.action='customer_called'
  order by e.occurred_at,e.id;
end $$;
revoke all on function public.booking_location_history(uuid),public.booking_call_history(uuid) from public,anon,authenticated;
grant execute on function public.booking_location_history(uuid),public.booking_call_history(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
