-- Additive only. No historical paid value is changed or inferred.
begin;
create table public.booking_payments (
 id uuid primary key,
 booking_id uuid not null references public.bookings(id) on delete restrict,
 actor_id uuid not null references public.profiles(id) on delete restrict,
 actor_name text not null,
 method text not null check (method in ('cash','card','bank_transfer')),
 amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 999999999999),
 expected_paid_cents bigint not null check (expected_paid_cents >= 0),
 expected_total_cents bigint not null check (expected_total_cents >= 0),
 paid_after_cents bigint not null,
 legacy_key_snapshot text,
 occurred_at timestamptz not null default clock_timestamp(),
 transaction_id bigint not null default txid_current(),
 check (paid_after_cents = expected_paid_cents + amount_cents),
 check (paid_after_cents <= expected_total_cents)
);
create index booking_payments_booking_idx on public.booking_payments(booking_id,occurred_at);
alter table public.booking_payments enable row level security;
revoke all on public.booking_payments from public,anon,authenticated,service_role;
grant select on public.booking_payments to authenticated,service_role;
create policy booking_payments_staff_read on public.booking_payments for select to authenticated
 using ((select private.is_staff()));
create function private.immutable_booking_payment() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Payment receipts are immutable' using errcode='42501'; end $$;
revoke all on function private.immutable_booking_payment() from public,anon,authenticated;
create trigger booking_payments_immutable before update or delete on public.booking_payments
 for each row execute function private.immutable_booking_payment();
create trigger booking_payments_audit after insert on public.booking_payments
 for each row execute function private.audit_change();

-- Existing booking edits must not silently rewrite paid outside the atomic ledger.
-- The receipt must be created in THIS transaction, by the authenticated actor.
create function private.guard_booking_payment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.paid is distinct from old.paid and not exists (
  select 1 from public.booking_payments p where p.booking_id=old.id
   and p.transaction_id=txid_current() and p.actor_id=auth.uid()
   and p.expected_paid_cents=old.paid*100 and p.paid_after_cents=new.paid*100
 ) then raise exception 'Use record_booking_payment to change paid' using errcode='42501'; end if;
 -- A later legacy note cannot double-count new cash. Nonmonetary notes remain editable.
 if new.key_cash is distinct from old.key_cash and coalesce(new.key_cash,'') ~ '[0-9]'
  and exists(select 1 from public.booking_payments where booking_id=old.id and method='cash')
 then raise exception 'Cash ledger exists; monetary key notes require reconciliation' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.guard_booking_payment() from public,anon,authenticated;
create trigger bookings_payment_guard before update on public.bookings
 for each row execute function private.guard_booking_payment();

create function public.record_booking_payment(
 p_request_id uuid,p_booking_id uuid,p_amount_cents numeric,p_method text,
 p_expected_paid_cents numeric,p_expected_total_cents numeric
) returns public.booking_payments
language plpgsql security definer set search_path='' as $$
declare v_booking public.bookings; v_receipt public.booking_payments; v_name text;
begin
 if not private.is_staff() then raise exception 'Staff access required' using errcode='42501'; end if;
 if p_request_id is null or p_booking_id is null or p_method is null
  or p_method not in ('cash','card','bank_transfer')
  or p_amount_cents is null or p_expected_paid_cents is null or p_expected_total_cents is null
 then raise exception 'Invalid payment context' using errcode='22023'; end if;
 -- Reject NaN, infinities and fractional cents BEFORE a narrowing cast can round.
 if p_amount_cents::text in ('NaN','Infinity','-Infinity')
  or p_expected_paid_cents::text in ('NaN','Infinity','-Infinity')
  or p_expected_total_cents::text in ('NaN','Infinity','-Infinity')
  or p_amount_cents <> trunc(p_amount_cents) or p_amount_cents <= 0 or p_amount_cents > 999999999999
  or p_expected_paid_cents <> trunc(p_expected_paid_cents) or p_expected_paid_cents < 0 or p_expected_paid_cents > 999999999999
  or p_expected_total_cents <> trunc(p_expected_total_cents) or p_expected_total_cents < 0 or p_expected_total_cents > 999999999999
 then raise exception 'Payment values must be finite integer cents' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,172200));
 select * into v_booking from public.bookings where id=p_booking_id for update;
 if not found then raise exception 'Booking not found' using errcode='P0002'; end if;
 select * into v_receipt from public.booking_payments where id=p_request_id;
 if found then
  if v_receipt.booking_id<>p_booking_id or v_receipt.actor_id<>auth.uid()
   or v_receipt.method<>p_method or v_receipt.amount_cents<>p_amount_cents
   or v_receipt.expected_paid_cents<>p_expected_paid_cents
   or v_receipt.expected_total_cents<>p_expected_total_cents
  then raise exception 'Payment request context mismatch' using errcode='23514'; end if;
  -- Always return the ORIGINAL immutable receipt, even after subsequent payments.
  return v_receipt;
 end if;
 if v_booking.paid*100 is distinct from p_expected_paid_cents
  or v_booking.total*100 is distinct from p_expected_total_cents
 then raise exception 'Booking changed; reload before payment' using errcode='PT409'; end if;
 if v_booking.status<>'confirmed' then raise exception 'Booking is not confirmed' using errcode='23514'; end if;
 if p_amount_cents > p_expected_total_cents-p_expected_paid_cents then
  raise exception 'Payment exceeds outstanding balance' using errcode='23514'; end if;
 -- Fail closed. A legacy note may already represent received cash. Never guess offsets.
 -- Any digit is intentionally conservative, including ambiguous key codes.
 if p_method='cash' and coalesce(v_booking.key_cash,'') ~ '[0-9]' then
  raise exception 'Legacy cash/key amount requires reconciliation before cash payment' using errcode='23514'; end if;
 select full_name into strict v_name from public.profiles where id=auth.uid() and active for share;
 insert into public.booking_payments(
  id,booking_id,actor_id,actor_name,method,amount_cents,expected_paid_cents,
  expected_total_cents,paid_after_cents,legacy_key_snapshot
 ) values (
  p_request_id,p_booking_id,auth.uid(),v_name,p_method,p_amount_cents,p_expected_paid_cents,
  p_expected_total_cents,p_expected_paid_cents+p_amount_cents,v_booking.key_cash
 ) returning * into v_receipt;
 update public.bookings set paid=v_receipt.paid_after_cents/100.0 where id=p_booking_id;
 return v_receipt;
end $$;
revoke all on function public.record_booking_payment(uuid,uuid,numeric,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.record_booking_payment(uuid,uuid,numeric,text,numeric,numeric) to authenticated;
notify pgrst,'reload schema';
commit;
