# Booking payments

Migration 20261017220000 is additive and contains no backfill or booking updates.
Apply only after review. It has not been applied by this implementation task.

The active admin/driver RPC records incremental actual collections, not a provider
settlement, receivable inference, invoice, or correction of imported paid balances.
Cash is the first UI method; card and bank transfer are explicit alternatives.
Existing imported paid remains unchanged until an explicit payment.

Pass the displayed booking total/paid snapshot as integer cents and one UUID per
payment intent. Keep the exact input and UUID after a timeout. The server serializes
the UUID globally and locks the booking row. A retry with identical actor, booking,
method, amount and original paid/total returns the ORIGINAL immutable receipt.
A changed context fails. Different requests with stale snapshots fail with 40001;
reload before creating another intent. Never silently retry using a fresh UUID.
Receipt paid_after_cents is historical, not necessarily the current paid balance.
Refresh the booking after success. No actor or timestamp is accepted from a client.

Amounts must be finite positive integer cents, not fractions rounded by PostgreSQL.
Overpayment, zero, negative and nonconfirmed-booking collections are rejected.
Booking and receipt writes plus both audit records commit or roll back together.
Receipt update/delete and direct API inserts are forbidden. Staff may read.
Existing-row paid changes now require a same-transaction ledger receipt; imports
can still insert historical initial paid. Editing a stale full booking with an old
paid value will fail instead of overwriting a newer collection. Refresh first.

## Legacy cash without invented reconciliation

Legacy key_cash is historical and may already mean money received, even when paid
says zero. Its relationship to price/paid is NOT inferred. Any digit-containing note
blocks a new CASH payment, deliberately including ambiguous numeric key codes.
Card/bank collections still increase paid but do not enter cash totals.
Once cash ledger exists, adding a digit-containing key_cash note is prohibited.
No note is auto-cleared, subtracted, allocated, rewritten or backfilled.
Resolving such legacy cases requires a future explicit, reviewed reconciliation
workflow. Do not clear a monetary note merely to get around the guard.

employeeCashTotals(bookings, payments) scopes both sources to the supplied booking
IDs and deduplicates booking/payment IDs. Ledger cash groups by server actor ID,
using the receipt's server-profile name snapshot. Legacy amounts use a separate
legacy identity namespace, visibly marked source=legacy, not a guessed profile.
Legacy amount-without-name means Wael; okAlaa means Alaa, matching the owner's rule.
It does not silently merge identical display names across the two namespaces.
A booking somehow containing both legacy numeric notes and cash receipts is flagged,
never added twice. Unparseable numeric notes are flagged. In either case totalCents
is null, so UI must show reconciliation required rather than an authoritative sum.
Per-source rows remain available for explanation. No claim of all-time employee
cash is valid unless the caller supplies all relevant bookings/receipts.
Manual off-system cash adjustments (such as the separately reported €180) are not
fabricated as ledger entries and are not included by this function.

No production payment RPC is called during tests. Verify SQL using isolated local
fixtures only, never real bookings. No migration apply, push, or deployment is part
of this task.

## Verification

Run `npx vitest run src/lib/booking-payments.test.ts` for API/report tests.
For isolated native PostgreSQL behavior, install @electric-sql/pglite outside the
production app, then run `PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node
--test tests/booking-payments.sql.check.mjs`. This creates an ephemeral in-memory
Postgres, provisions fixture-only auth/storage scaffolding, applies the original
backend and this exact migration, and checks privileges, immutable retries,
precision validation, snapshots, legacy guards, audit and forced-write rollback.
It never reads .env files or opens a network connection. Real multi-session lock
contention is not simulated by PGlite; booking FOR UPDATE and advisory request
locks are present, while actual production concurrency testing remains separate.
