Booking gear actions

The additive 20261017210000 migration creates authenticated RPC apply_booking_detail_action and restricted immutable idempotency receipts. No existing bookings are modified on deployment. Apply after the handover/undo migrations. It also works with the 190000 lifecycle hardening migration.

transitionBookingStatus({booking,status,requestId}) accepts no_show or cancelled. Only active admins can change status, and only confirmed bookings with neither historical check-in nor checkout. Undo must be explicit and separate, never bundled into cancellation. Location changes accept an actual nonempty trimmed spot of at most 100 characters, for active admins or drivers, on confirmed bookings not checked out. No product, covered flag, customer, financial or timestamp fields are changed.

The API sends expected status, endpoints, spot and lifecycle_revision (undo-receipt count, defaults zero for never-undone bookings). The latest loaded booking must supply lifecycle_revision after an undo. Booking row locks serialize with all lifecycle/operation RPCs. UUID receipt lock serializes retries; a reused request must match actor, booking, target, action and exact expected JSON. Keep original booking snapshot and request UUID after an ambiguous response, or reload and create a fresh request. A retry returns current booking without reapplying the old action. API normalizes nullable text. Returned lifecycle_revision conservatively retains the submitted revision; reload after a retry when another lifecycle change may have occurred.

Histories expose dedicated staff-only projections, not raw audit records. loadBookingLocationHistory(id) returns {id,occurred_at,actor_id,actor_name,old_spot,new_spot}; actual booking INSERT/UPDATE audit rows with changed spot are included, including imported initial assignments. A null old spot means first recorded assignment. loadBookingCallHistory(id) returns {id,occurred_at,actor_id,actor_name}; only recorded customer_called operation events, not tel-link clicks. Older call events remain history after undo. Empty arrays mean no recorded entries, failures throw and must not be rendered as an empty history. Actor names can be null for imports/system actions or missing profile attribution.

Status/location writes retain all timestamps, money, original booking data, photos/signatures and existing audit history. Existing ordinary booking-edit and update_booking_ops interfaces retain their original permissions; the new RPC is not a claim to replace every pre-existing edit path. Deletion of bookings with new receipts is restricted intentionally to retain audit evidence.

Validation is fully isolated, no hosted writes
node supabase/tests/booking-detail-actions.mjs
npm test -- src/lib/booking-actions.test.ts
npm run build

SQL test uses the established local PGlite package at /tmp/tvp-dbtest unless TVP_PGLITE_MODULE is supplied. Tests cover access checks, no-show/cancel rejection after check-in/out, spot bounds, stale snapshots, ABA undo revision, receipts and retries, cross-actor request reuse, immutable receipt guard, limited history projections and truthful empty histories.

Native optional edit fields

Separate additive migration 20261017210100_booking_optional_details.sql adds nullable first_name and last_name (120 characters each), and car_description (500 characters). There is no UPDATE/backfill/default, no splitting of customer_name, and no staff RPC permission expansion. Existing rows read null for the new columns; when validating original imported records compare the original column set rather than full SELECT-star shape. The migration tolerates columns and its constraint already existing. A database constraint validates lengths.

Booking models permit those three fields optionally as string|null. Admin bookingWritePayload only emits them when present as an own property and not undefined. Explicit null clears a value; omitted fields never erase it. Legacy full name remains independently preserved. Staff saveBooking continues using only the pre-existing operational patch allowlist. The editor should expose native names, never derive them from a legacy full name without a deliberate user change.

node supabase/tests/booking-optional-details.mjs validates schema idempotency, exact original-column preservation, null defaults, length boundaries, and staff denial in an isolated database.
