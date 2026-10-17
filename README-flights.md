# DUS arrival/departure flight updates

The app uses the public arrivals/departures boards operated by Düsseldorf Airport. No paid API or provider key is required. This is an undocumented website endpoint, NOT a contracted or guaranteed API. Its availability, format, retention and permitted reuse can change. Review DUS terms and obtain permission/contract for sustained commercial use. Do not promise production SLA or historical coverage.

## Verified source

Official board: https://www.dus.com/en/flights/arrivals

Website JS examined: https://www.dus.com/Assets/dus.87ae3cd67981b5cedf3c.js

Its actual endpoint is `https://www.dus.com/api/sitecore/flightapi/SearchFlightsWithOutParams`. Required request header: `X-Requested-With: XMLHttpRequest` (without it the source returns HTTP 400). Query parameters are `lang=en`, `arrival=true` (arrivals) or `arrival=false` (departures), `codeshare=true`, `count=500`, `offset=0`, `showDetails=false`, `flightStartTime`, `flightEndTime`. Each day boundary is computed in Europe/Berlin, including DST. Pagination is checked rather than silently truncating.

Live test on 17 October 2026 returned 243 arrivals. EW9751 reported scheduled 10:45 CEST, estimated 11:38:58 CEST, actual null. The adapter correctly reported 54 minutes delay and did not invent a landing time. These are verification examples, not fixture data used by the application.

## Client contract

`src/lib/flights.ts` exports `fetchFlightUpdates(flightNumbers: string[], date: string, direction?: 'arrival' | 'departure'): Promise<FlightUpdatesResult>`, `normalizeFlightNumber`, and the `FlightUpdate`, `FlightUpdatesResult`, `FlightStatus` types. It uses raw fetch with the configured public anon key, independently of any user session or auth refresh. No service-role credential is used in the client or flight handler.

Result fields are `flights`, `missing`, `source`, `updatedAt`, `cached`, optional `availability` (`live`, `schedule`, `unavailable`) and optional German `note`. The deployed backend always sends availability/note; optional typing preserves older fixtures and clients. Each flight also has optional `dataKind` (`live` or `schedule`). Each flight has `flightNumber`, nullable ISO UTC `scheduled`, `estimated`, `actual`, `status`, nullable `statusText`, nullable `delayMinutes`, `source`, `updatedAt`. Status values are scheduled, delayed, approaching, landed, departed, cancelled, diverted, unknown. The raw public status text is kept when available. Delay is actual minus scheduled when actual exists, otherwise estimated minus scheduled. Negative delay means early arrival.

The date is the flight's SCHEDULED calendar date in Europe/Berlin, not the parking date or the actual landing date. A flight scheduled just before midnight may land on the following date; callers should query the booking's scheduled return day and can query the adjacent day if needed. Flight normalization supports IATA/ICAO formatting and removes spaces, hyphens and leading numeric zeroes, but does NOT translate ICAO airline prefixes to IATA. Unknown numbers are explicitly in `missing`; not found is not proof of cancellation. Codeshares are included separately when supplied by DUS.

Customer return `booking.flight_out` is a DUS arrival (`direction: 'arrival'`, the default). `flight_in` is the customer's outbound flight at dropoff and MUST use `direction: 'departure'`. Direction is validated strictly and included in the cache/pending-request keys; arrivals cannot leak into departures or vice versa. Actual departure is `departed`, never `landed`. No writes are made to bookings or existing manually recorded actual_flight_* fields. Keep live flight facts separate from vehicle check-in/check-out facts.

Source/auth/validation errors throw explicit German messages. Do not replace missing estimated/actual timestamps with scheduled ones and label them live. On errors, clear or visibly mark any previous result as stale. `updatedAt` is when our proxy successfully fetched that snapshot, not an airline-provided measurement timestamp.

## Edge function and security

Source lives in `supabase/functions/dus-flights/index.ts` and `supabase/functions/_shared/flights.ts`. Gateway JWT verification is off for publishable-key compatibility, but the function independently validates the bearer token with Supabase Auth and checks the user's own active staff profile through RLS. Anonymous requests fail. No service-role key is used. Supabase URL/anon key are supplied by the edge runtime and no upstream API key is needed.

Only POST is accepted; CORS permits `https://alaaaya.github.io` and `http://localhost:5173`. Dates are restricted to seven calendar days before through 365 calendar days after today in Europe/Berlin, batch sizes to 100, payload to 8 KB. Requests cannot specify arbitrary upstream URLs. The source has 12-second per-page timeouts and a pagination ceiling. User JWTs are never forwarded to DUS. Errors do not expose upstream bodies or secrets.

Successful full-day snapshots are cached for 60 seconds in isolate memory and concurrent requests in that isolate share an in-flight fetch. There is no shared persistent cache or global rate limiter; parallel/cold isolates may fetch independently. The per-user 30 requests/minute limit is likewise best-effort per isolate. For larger-scale use add durable caching and gateway throttling before increasing traffic. Failed source refreshes return an explicit 502, not silently stale data.

Deployment endpoint and final smoke-test evidence are recorded below after deployment. Deployment does not publish the frontend; the UI owner must build/publish it separately.

## Deployment verification, 17 October 2026

Deployed ACTIVE v1 at https://xblgioeurvzqeaitumdq.supabase.co/functions/v1/dus-flights with gateway JWT verification false and the application-level Auth/profile checks above. Independent authenticated live smoke tests returned HTTP 200 and matched a separately fetched official DUS source. EW9463 was scheduled/estimated 09:10 UTC, actual 09:04:20 UTC, landed, delay -6 minutes. EW9751 was scheduled 08:45 UTC, estimated 09:38:58 UTC, actual null, delay +54. ZZ9999 was explicitly missing. Anonymous and invalid token returned 401, malformed/hostile input 400, outside-supported-range date 422, foreign Origin 403. Production CORS header matched the GitHub Pages origin.

Sequential deployed requests both reported cached=false, consistent with fresh isolates; cache reuse is NOT proven and must not be assumed. The implementation's 60-second memory cache is only best-effort. Add a shared durable cache for reliable request reduction at scale.

## Date-valid future timetables, 17 October 2026

The same official DUS endpoint publishes actual future flight rows, not only today's live board. There is no recurring-flight extrapolation, scraped third-party timetable or hardcoded Iberia schedule in runtime code. The backend requests the exact selected Berlin calendar day and independently checks each returned scheduled timestamp against that day. `readDusDay(date, fetcher?, direction?)` retains the previous two-argument signature. The board may publish some future dates but not others; the 365-day request bound is not a promise of 365-day source coverage.

Future dates return `availability: 'schedule'` when a requested date-valid row exists, with `dataKind: 'schedule'`, verified scheduled ISO time and note `Flugplan bestätigt. Live ab Flugtag.` Estimated, actual and delay are null, and status is scheduled, never fabricated operational data. Future dates without a matching row return HTTP 200, empty flights, explicit missing numbers, `availability: 'unavailable'` and `Live ab Flugtag. Kein bestätigter Flugplan verfügbar.` A source failure remains an explicit 502; missing data must not be confused with a failed fetch or a cancelled flight. Current/past source rows use `dataKind: 'live'`; this denotes an operational-board snapshot, not a guarantee that every row contains an estimate/actual.

Official independently fetched source snapshots verified these examples on 17 October 2026. These are research evidence only, not application fixtures or fallback times.

| Exact date | Direction | Number | DUS local scheduled time | ISO UTC |
| --- | --- | --- | --- | --- |
| 2026-10-24 | arrival | IB1325 | 22:20 CEST | 2026-10-24T20:20:00.000Z |
| 2026-10-24 | departure | IB1326 | 06:20 CEST | 2026-10-24T04:20:00.000Z |
| 2026-11-10 | arrival | IB1325 | 22:35 CET | 2026-11-10T21:35:00.000Z |

The different winter time confirms why copying today's flight schedule would be wrong. The official board returned an empty list for 17 October 2027, correctly treated as unavailable.

Primary research sources are https://www.dus.com/en/flights/arrivals and https://www.dus.com/en/flights/departures with their public `SearchFlightsWithOutParams` endpoint. Secondary cross-check only, not used by the application, https://flyteam.jp/en/airline_route/mad_dus/flight_schedule and https://flyteam.jp/en/airline_route/dus_mad/flight_schedule listed IB1325 daily 19:50 MAD / 22:20 DUS and IB1326 daily 06:20 DUS / 09:00 MAD for 1–24 October 2026, as of 5 October 2026. Their later winter rows differ. Official per-date DUS records remain the runtime authority.

Backend regression tests live in `supabase/tests/flights-backend.test.ts`; run them together with the original adapter suite using `npx vitest run supabase/tests/flights-backend.test.ts src/lib/flights.test.ts`. Validate the edge runtime with `deno check supabase/functions/dus-flights/index.ts`.


## Public lookup and terminal auth recovery (17 October 2026)

Only `dus-flights` has `verify_jwt=false` in `supabase/config.toml`. The handler requires the app's public anon key in both `apikey` and Bearer headers, restricts CORS/method/body size/allowed JSON fields/flight numbers/dates, and only returns selected public DUS flight facts. It never reads profiles, bookings or customer data.

Set Edge secret `TVP_FLIGHTS_PUBLIC_KEY` to the same PUBLIC anon key as `VITE_SUPABASE_ANON_KEY` before deploying. The platform-provided Edge `SUPABASE_ANON_KEY` can differ from the dashboard legacy anon key; the explicit public key avoids an erroneous 401. This value is public, not a service-role credential.

Apply migration `20261017150000_public_flight_budget.sql`. Its atomic PostgreSQL RPC consumes a global budget of 120 requests/minute and 2400/hour across all isolates and restarts, including cached and invalid-body requests. Anonymous callers can consume the same budget but cannot read, reset, or change limits. A public endpoint cannot treat an anon key or CORS as secret authentication. A distributed denial-of-service can exhaust this shared cap, but cannot cause unbounded upstream traffic. The handler fails closed with 503 if the budget database is unavailable and returns 429 with Retry-After when capped. Counter-only internal writes contain no customer data.

Auth recovery remains required for protected bookings. Invalid/revoked refresh tokens clear the local session and show login; transient network/5xx errors retain it for focus/visibility/online retries. Supabase local-scope signout may contact Auth to revoke only that session, never all user sessions. Public flight fetch does not invoke any Auth method.

Verification includes handler security tests, isolated SQL budget/permission tests, real anonymous A3540 lookup and invalid-refresh browser login recovery. No booking or operation writes.
