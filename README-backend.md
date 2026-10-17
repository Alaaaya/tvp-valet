A dedicated live TVP project has been provisioned in EU Frankfurt, separate from the IPTV project. The migration is applied, the initial administrator exists, public and anonymous signup are disabled, and authenticated booking/check-in/check-out and private media upload/download were verified. Verification test booking and media were removed. Credentials are held outside the repository. Public Pages frontend uses only the public anon key. E-mail ingestion and partner connectors remain phase 2.

Run these commands from the repository after installing dependencies. The CLI prompts for credentials when necessary. Do not put database passwords or service keys in committed files, browser environment variables, terminal recordings or shell history.

```sh
npx supabase login
npx supabase init
npx supabase link --project-ref "$TVP_SUPABASE_PROJECT_REF"
npx supabase db push --dry-run
npx supabase db push
```

The migration is supabase/migrations/20261017090000_valet_backend.sql. Alternatively execute the entire migration in a new project's SQL editor as the postgres owner. It is transactional and runs once. Existing tables with these names intentionally fail rather than overwrite data. Keep private out of the exposed API schemas. Disable public Auth signups and anonymous sign-ins in the dashboard; unprovisioned identities have no data access even if signup is accidentally enabled. Require HTTPS, strong passwords and preferably MFA for admins.

For the first admin only, securely inject SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TVP_ADMIN_EMAIL, TVP_ADMIN_PASSWORD and TVP_ADMIN_NAME into an operator shell, then run the following. The password must be unique and at least 16 characters. The script refuses when an active admin exists. It creates a confirmed identity without sending email and inserts the admin profile. No bootstrap function is exposed to browser clients.

```sh
node supabase/scripts/create-admin.mjs
```

For another employee, inject SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TVP_EMPLOYEE_EMAIL and TVP_EMPLOYEE_PASSWORD, then run the following. This creates an identity only and prints its UUID. It does not send email or grant staff access.

```sh
node supabase/scripts/create-auth-user.mjs
```

Profiles expose id, full_name, email, role, active and created_at. Email is informational, copied from the Auth identity during employee management and synchronized when the Auth email changes. No signup trigger provisions staff. The frontend role selector calls set_employee_role with p_id and p_role; this admin-only RPC preserves the employee name and active flag and enforces the same last-admin protection.

An authenticated active admin then calls manage_employee with p_user_id, p_display_name, p_role set to admin or driver, and p_active. The same function edits names, changes roles and disables staff. Profiles cannot be inserted or changed directly by browser clients, including admins. The last active admin cannot be disabled or demoted through this function, with concurrent role changes serialized. Disabled staff immediately lose database and Storage permissions even with an unexpired JWT. Auth identities/passwords are managed only by a trusted server or the Supabase dashboard. Never use user-editable Auth metadata as authorization.

Authenticated active staff can read profiles, products and bookings. Admins alone can directly create, update and delete products/bookings and read import_log/audit_log. All booking, profile, product and import-log writes produce immutable-to-client audit entries with actor, before/after records and timestamp. Audit records include customer data; restrict access and define an operational retention/backup policy. Service-role credentials bypass RLS by design and are for trusted operators only.

Drivers cannot directly insert/delete bookings or update any booking columns, even by bypassing the frontend. They use update_booking_ops with p_id and p_patch. Only key_cash, spot, km, comment and driver_id are accepted. key_cash is free text such as "10€ Wael", km is a nonnegative integer or null, driver_id must identify an active employee or be null, and text fields may be cleared with null. Unknown fields or invalid JSON types reject the whole patch. All active drivers may operate on all bookings, matching a shared valet lot. Driver assignment is not an ownership restriction.

check_booking accepts p_id and p_action equal to in or out. It locks the booking, requires confirmed status, permits a single check-in and then a single check-out, and records server timestamps. Repeat actions, check-out before check-in, cancelled/no-show bookings, missing IDs and nonstaff callers fail without mutation. Actual check-in/out times stay separate from flight times and planned arrival/departure. Status stays confirmed for completed bookings; checked_out_at determines completion.

The bookings columns are id, code, external_id, platform, customer_name, phone, email, persons, plate, product, covered, arrival_at, departure_at, flight_in, flight_out, actual_flight_in, actual_flight_out, checked_in_at, checked_out_at, status, total, paid, key_cash, spot, km, comment, driver_id and created_at. product references products.code. status is confirmed, cancelled or no_show. paid is an amount in EUR, not a boolean. Dates are timestamptz and should be displayed in Europe/Berlin, never shifted with a fixed UTC offset. actual_flight_in and actual_flight_out are timestamps. A cancelled/no-show record cannot also have checked_in_at. Plate may be empty when not known.

Products contain code, label, covered, day_one, daily_extra and covered_extra. The two initial products are VALET-F and VALET-C. Their sample quote formula is day_one + max(days - 1, 0) * daily_extra + (covered ? covered_extra : 0). Both have day_one 40, daily_extra 10 and covered_extra 10. These are manual defaults only, not partner-platform prices or a historical tariff import.

An admin calls import_bookings with p_rows as a JSON array, maximum 1000 rows and 2 MiB. Each row requires nonblank external_id and platform, customer_name, arrival_at and departure_at. Imports accept only code, external_id, platform, customer_name, phone, email, persons, plate, product, covered, arrival_at, departure_at, flight_in, flight_out, actual_flight_in, actual_flight_out, status, total and paid. No operational fields, IDs or client-controlled audit fields are allowed. Numeric and boolean fields must use JSON numbers/booleans. Timestamps need Z or an explicit offset such as +02:00. Each row runs in a subtransaction; valid rows survive errors elsewhere. The returned object contains log_id, imported, skipped and errors with one-based row numbers and safe error codes/messages. Raw invalid customer data is not retained in the import errors.

platform is trimmed/lowercased and external_id trimmed, with a unique constraint over the pair. Reimporting an existing external reference skips it without altering staff work or historical prices. A changed booking must be reviewed and updated explicitly by an admin; import is deliberately insert-only. A duplicate code against another external booking is an error, not an overwrite.

The private booking-media bucket accepts JPEG, PNG, WebP and PDF up to 10 MiB. Upload object paths must use a real booking UUID followed by a single filename, for example <booking-id>/<random-uuid>.jpg. Staff can read and append media. Only admins can replace/delete it, preserving driver evidence. A restrictive policy also prevents broad unrelated Storage policies from exposing this bucket. No public URLs are provided. Prefer authenticated downloads. If signed URLs are necessary keep lifetimes short, because already-issued signed URLs remain bearer capabilities until expiry, even after staff deactivation. MIME allowlists are not malware scanning; render untrusted content safely, avoid inline HTML and scan files server-side before external distribution.

These calls use the existing signed-in browser session and its public project key only.

```js
await supabase.rpc('check_booking', { p_id: bookingId, p_action: 'in' })
await supabase.rpc('update_booking_ops', {
  p_id: bookingId,
  p_patch: { spot: 'A12', key_cash: '10€ Wael', km: 12500 }
})
await supabase.rpc('set_employee_role', { p_id: employeeId, p_role: 'driver' })
await supabase.rpc('manage_employee', {
  p_user_id: employeeId, p_display_name: 'Driver', p_role: 'driver', p_active: true
})
await supabase.rpc('import_bookings', {
  p_rows: [{
    external_id: 'partner-123', platform: 'allopark', customer_name: 'Example Customer',
    arrival_at: '2026-10-17T09:00:00+02:00', departure_at: '2026-10-19T09:00:00+02:00',
    total: 60, paid: 60
  }]
})
```

Always inspect error before treating RPC or table writes as successful. Direct driver UPDATE/DELETE returns no affected rows because RLS filters them out. Treat that as a rejected write, not success.

Run the PostgreSQL security regression tests locally as follows. PGlite is a real PostgreSQL WASM engine with a minimal auth/storage SQL fixture; it tests SQL permissions, RLS, functions, audit and constraints, not the live Auth or Storage HTTP services. No credentials or network access to a project are needed.

```sh
npm install --prefix /tmp/tvp-dbtest @electric-sql/pglite --no-audit --no-fund
TVP_PGLITE_MODULE=/tmp/tvp-dbtest/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/run.mjs
node --check supabase/scripts/create-admin.mjs
node --check supabase/scripts/create-auth-user.mjs
```

Before production use, run a fresh-project Supabase migration and verify real authenticated uploads, downloads, anonymous rejection, disabled employee rejection, admin/driver role separation and backups. Provisioning and these hosted service checks are blocked until an authorized operator logs in. No email ingestion, platform scraping, flight integration or outbound messaging is included in this schema.


For GitHub Pages builds, export VITE_BASE_PATH=/tvp-valet/ in the build command itself. Vite configuration reads process.env before .env.production.local is loaded. Deploy dist contents with .nojekyll to gh-pages.
