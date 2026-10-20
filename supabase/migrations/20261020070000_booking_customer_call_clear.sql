-- Clear (reset) a recorded customer call time. Additive: new immutable, audited receipt ledger.
-- Call history (legacy events + call receipts) is left untouched as the audit trail; only the
-- operational timestamp booking_operations.customer_called_at goes back to null.
-- lifecycle_revision is derived (count of booking_handover_undos), so it is checked, not bumped;
-- the expected called_at snapshot is what makes a stale clear fail with PT409.
begin;
create table public.booking_customer_call_clear_receipts (
 id uuid primary key,
 booking_id uuid not null references public.bookings(id) on delete restrict,
 actor_id uuid not null references public.profiles(id),
 expected_called_at timestamptz not null,
 expected_lifecycle_revision bigint not null check(expected_lifecycle_revision>=0),
 occurred_at timestamptz not null default clock_timestamp()
);
alter table public.booking_customer_call_clear_receipts enable row level security;
revoke all on public.booking_customer_call_clear_receipts from public,anon,authenticated,service_role;
grant select on public.booking_customer_call_clear_receipts to authenticated,service_role;
create policy customer_call_clear_receipts_admin_read on public.booking_customer_call_clear_receipts
 for select to authenticated using ((select private.is_admin()));
create trigger customer_call_clear_receipts_immutable before update or delete on public.booking_customer_call_clear_receipts
 for each row execute function private.immutable_customer_call_receipt();
create trigger customer_call_clear_receipts_audit after insert on public.booking_customer_call_clear_receipts
 for each row execute function private.audit_change();

create function public.clear_booking_customer_call(
 p_request_id uuid,p_booking_id uuid,p_expected_called_at timestamptz,p_expected_lifecycle_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_booking public.bookings; v_ops public.booking_operations;
 v_receipt public.booking_customer_call_clear_receipts; v_revision bigint; v_now timestamptz;
begin
 if not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
 if p_request_id is null or p_booking_id is null or p_expected_called_at is null
  or not isfinite(p_expected_called_at)
  or p_expected_lifecycle_revision is null or p_expected_lifecycle_revision<0
 then raise exception 'Invalid call clear identity or snapshot' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,172301));
 -- Same lock ordering as record_booking_customer_call / undo.
 select * into v_booking from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'Booking not found' using errcode='P0002'; end if;
 select * into v_ops from public.booking_operations where booking_id=p_booking_id for update;
 select count(*) into v_revision from public.booking_handover_undos where booking_id=p_booking_id;
 select * into v_receipt from public.booking_customer_call_clear_receipts where id=p_request_id;
 if found then
  if v_receipt.booking_id<>p_booking_id or v_receipt.actor_id<>auth.uid()
   or v_receipt.expected_called_at<>p_expected_called_at
   or v_receipt.expected_lifecycle_revision<>p_expected_lifecycle_revision
  then raise exception 'Call clear request context mismatch' using errcode='23514'; end if;
  return jsonb_build_object('receipt_id',v_receipt.id,'occurred_at',v_receipt.occurred_at,
   'customer_called_at',v_ops.customer_called_at,'lifecycle_revision',v_revision);
 end if;
 if v_ops.customer_called_at is distinct from p_expected_called_at
  or v_revision<>p_expected_lifecycle_revision
 then raise exception 'Booking changed; reload' using errcode='PT409'; end if;
 if v_booking.status<>'confirmed' or v_booking.checked_out_at is not null then
  raise exception 'Call clear requires an open confirmed booking' using errcode='23514'; end if;
 v_now:=clock_timestamp();
 update public.booking_operations set customer_called_at=null,performed_by=auth.uid(),updated_at=v_now
  where booking_id=p_booking_id;
 insert into public.booking_customer_call_clear_receipts
  (id,booking_id,actor_id,expected_called_at,expected_lifecycle_revision,occurred_at)
  values(p_request_id,p_booking_id,auth.uid(),p_expected_called_at,p_expected_lifecycle_revision,v_now);
 return jsonb_build_object('receipt_id',p_request_id,'occurred_at',v_now,
  'customer_called_at',null,'lifecycle_revision',v_revision);
end $$;
revoke all on function public.clear_booking_customer_call(uuid,uuid,timestamptz,bigint) from public,anon,authenticated;
grant execute on function public.clear_booking_customer_call(uuid,uuid,timestamptz,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
