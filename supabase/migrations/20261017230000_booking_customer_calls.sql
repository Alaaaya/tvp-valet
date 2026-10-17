-- Additive call ledger. No booking updates/backfill; old events remain authoritative history.
begin;
create table public.booking_customer_call_receipts (
 id uuid primary key,
 history_id bigint generated always as identity unique,
 booking_id uuid not null references public.bookings(id) on delete restrict,
 actor_id uuid not null references public.profiles(id),
 expected_called_at timestamptz,
 expected_checked_out_at timestamptz,
 expected_lifecycle_revision bigint not null check(expected_lifecycle_revision>=0),
 allow_repeat boolean not null,
 occurred_at timestamptz not null default clock_timestamp()
);
alter table public.booking_customer_call_receipts enable row level security;
revoke all on public.booking_customer_call_receipts from public,anon,authenticated,service_role;
grant select on public.booking_customer_call_receipts to authenticated,service_role;
create policy customer_call_receipts_admin_read on public.booking_customer_call_receipts
 for select to authenticated using ((select private.is_admin()));
create function private.immutable_customer_call_receipt() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Call receipts are immutable' using errcode='42501'; end $$;
revoke all on function private.immutable_customer_call_receipt() from public,anon,authenticated;
create trigger customer_call_receipts_immutable before update or delete on public.booking_customer_call_receipts
 for each row execute function private.immutable_customer_call_receipt();
create trigger customer_call_receipts_audit after insert on public.booking_customer_call_receipts
 for each row execute function private.audit_change();

create function public.record_booking_customer_call(
 p_request_id uuid,p_booking_id uuid,p_expected_called_at timestamptz,
 p_expected_checked_out_at timestamptz,p_expected_lifecycle_revision bigint,
 p_allow_repeat boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_booking public.bookings; v_ops public.booking_operations;
 v_receipt public.booking_customer_call_receipts; v_revision bigint; v_now timestamptz;
begin
 if not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
 if p_request_id is null or p_booking_id is null or p_allow_repeat is null
  or p_expected_lifecycle_revision is null or p_expected_lifecycle_revision<0
  or (p_expected_called_at is not null and not isfinite(p_expected_called_at))
  or (p_expected_checked_out_at is not null and not isfinite(p_expected_checked_out_at))
 then raise exception 'Invalid call identity or snapshot' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,172300));
 -- Same ordering as undo and existing operational RPCs.
 select * into v_booking from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'Booking not found' using errcode='P0002'; end if;
 select * into v_ops from public.booking_operations where booking_id=p_booking_id for update;
 select count(*) into v_revision from public.booking_handover_undos where booking_id=p_booking_id;
 select * into v_receipt from public.booking_customer_call_receipts where id=p_request_id;
 if found then
  if v_receipt.booking_id<>p_booking_id or v_receipt.actor_id<>auth.uid()
   or v_receipt.expected_called_at is distinct from p_expected_called_at
   or v_receipt.expected_checked_out_at is distinct from p_expected_checked_out_at
   or v_receipt.expected_lifecycle_revision<>p_expected_lifecycle_revision
   or v_receipt.allow_repeat<>p_allow_repeat
  then raise exception 'Call request context mismatch' using errcode='23514'; end if;
  return jsonb_build_object('receipt_id',v_receipt.id,'occurred_at',v_receipt.occurred_at,
   'customer_called_at',v_ops.customer_called_at,'lifecycle_revision',v_revision);
 end if;
 if v_ops.customer_called_at is distinct from p_expected_called_at
  or v_booking.checked_out_at is distinct from p_expected_checked_out_at
  or v_revision<>p_expected_lifecycle_revision
 then raise exception 'Booking changed; reload' using errcode='40001'; end if;
 if v_booking.status<>'confirmed' or v_booking.checked_out_at is not null then
  raise exception 'Call requires an open confirmed booking' using errcode='23514'; end if;
 if v_ops.customer_called_at is not null and not p_allow_repeat then
  raise exception 'Explicit repeat call confirmation required' using errcode='23514'; end if;
 v_now:=clock_timestamp();
 if v_ops.customer_called_at>v_now or v_booking.checked_in_at>v_now then
  raise exception 'Operational timestamp is in the future' using errcode='23514'; end if;
 insert into public.booking_operations(booking_id,performed_by,updated_at)
  values(p_booking_id,auth.uid(),v_now) on conflict(booking_id) do nothing;
 update public.booking_operations set customer_called_at=v_now,performed_by=auth.uid(),updated_at=v_now
  where booking_id=p_booking_id;
 insert into public.booking_customer_call_receipts
  (id,booking_id,actor_id,expected_called_at,expected_checked_out_at,expected_lifecycle_revision,allow_repeat,occurred_at)
  values(p_request_id,p_booking_id,auth.uid(),p_expected_called_at,p_expected_checked_out_at,p_expected_lifecycle_revision,p_allow_repeat,v_now);
 return jsonb_build_object('receipt_id',p_request_id,'occurred_at',v_now,
  'customer_called_at',v_now,'lifecycle_revision',v_revision);
end $$;
revoke all on function public.record_booking_customer_call(uuid,uuid,timestamptz,timestamptz,bigint,boolean) from public,anon,authenticated;
grant execute on function public.record_booking_customer_call(uuid,uuid,timestamptz,timestamptz,bigint,boolean) to authenticated;

-- New calls are recorded ONLY in the receipt ledger, never duplicated into old events.
-- Negative receipt IDs and positive legacy event IDs keep the established bigint contract.
create or replace function public.booking_call_history(p_booking_id uuid)
returns table(id bigint,occurred_at timestamptz,actor_id uuid,actor_name text)
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
 if not exists(select 1 from public.bookings where bookings.id=p_booking_id) then
  raise exception 'Booking not found' using errcode='P0002'; end if;
 return query
 select h.id,h.occurred_at,h.actor_id,p.full_name from (
  select e.id,e.occurred_at,e.actor_id from public.booking_operation_events e
   where e.booking_id=p_booking_id and e.action='customer_called'
  union all
  select -r.history_id,r.occurred_at,r.actor_id from public.booking_customer_call_receipts r
   where r.booking_id=p_booking_id
 ) h left join public.profiles p on p.id=h.actor_id order by h.occurred_at,h.id;
end $$;
revoke all on function public.booking_call_history(uuid) from public,anon,authenticated;
grant execute on function public.booking_call_history(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
