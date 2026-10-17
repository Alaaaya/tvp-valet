# DUS arrival flight updates

The app uses the public arrivals board operated by Düsseldorf Airport. No paid API or provider key is required. This is an undocumented website endpoint, NOT a contracted or guaranteed API. Its availability, format, retention and permitted reuse can change. Review DUS terms and obtain permission/contract for sustained commercial use. Do not promise production SLA or historical coverage.

## Verified source

Official board: https://www.dus.com/en/flights/arrivals

Website JS examined: https://www.dus.com/Assets/dus.87ae3cd67981b5cedf3c.js

Its actual endpoint is `https://www.dus.com/api/sitecore/flightapi/SearchFlightsWithOutParams`. Required request header: `X-Requested-With: XMLHttpRequest` (without it the source returns HTTP 400). Query parameters are `lang=en`, `arrival=true`, `codeshare=true`, `count=500`, `offset=0`, `showDetails=false`, `flightStartTime`, `flightEndTime`. Each day boundary is computed in Europe/Berlin, including DST. Pagination is checked rather than silently truncating.

Live test on 17 October 2026 returned 243 arrivals. EW9751 reported scheduled 10:45 CEST, estimated 11:38:58 CEST, actual null. The adapter correctly reported 54 minutes delay and did not invent a landing time. These are verification examples, not fixture data used by the application.

## Client contract

`src/lib/flights.ts` exports `fetchFlightUpdates(flightNumbers: string[], date: string): Promise<FlightUpdatesResult>`, `normalizeFlightNumber`, and the `FlightUpdate`, `FlightUpdatesResult`, `FlightStatus` types. It uses the existing signed-in Supabase client.

Result fields are `flights`, `missing`, `source`, `updatedAt`, `cached`. Each flight has `flightNumber`, nullable ISO UTC `scheduled`, `estimated`, `actual`, `status`, nullable `statusText`, nullable `delayMinutes`, `source`, `updatedAt`. Status values are scheduled, delayed, approaching, landed, cancelled, diverted, unknown. The raw public status text is kept when available. Delay is actual minus scheduled when actual exists, otherwise estimated minus scheduled. Negative delay means early arrival.

The date is the flight's SCHEDULED calendar date in Europe/Berlin, not the parking date or the actual landing date. A flight scheduled just before midnight may land on the following date; callers should query the booking's scheduled return day and can query the adjacent day if needed. Flight normalization supports IATA/ICAO formatting and removes spaces, hyphens and leading numeric zeroes, but does NOT translate ICAO airline prefixes to IATA. Unknown numbers are explicitly in `missing`; not found is not proof of cancellation. Codeshares are included separately when supplied by DUS.

Only customer return `booking.flight_out` is a DUS arrival. `flight_in` is the customer's outbound flight at dropoff and MUST NOT be matched against this arrival-only endpoint. No writes are made to bookings or existing manually recorded actual_flight_* fields. Keep live flight facts separate from vehicle check-in/check-out facts.

Source/auth/validation errors throw explicit German messages. Do not replace missing estimated/actual timestamps with scheduled ones and label them live. On errors, clear or visibly mark any previous result as stale. `updatedAt` is when our proxy successfully fetched that snapshot, not an airline-provided measurement timestamp.

## Edge function and security

Source lives in `supabase/functions/dus-flights/index.ts` and `supabase/functions/_shared/flights.ts`. Gateway JWT verification is off for publishable-key compatibility, but the function independently validates the bearer token with Supabase Auth and checks the user's own active staff profile through RLS. Anonymous requests fail. No service-role key is used. Supabase URL/anon key are supplied by the edge runtime and no upstream API key is needed.

Only POST is accepted; CORS permits `https://alaaaya.github.io` and `http://localhost:5173`. Dates are restricted to seven days either side of today, batch sizes to 100, payload to 8 KB. Requests cannot specify arbitrary upstream URLs. The source has 12-second per-page timeouts and a pagination ceiling. User JWTs are never forwarded to DUS. Errors do not expose upstream bodies or secrets.

Successful full-day snapshots are cached for 60 seconds in isolate memory and concurrent requests in that isolate share an in-flight fetch. There is no shared persistent cache or global rate limiter; parallel/cold isolates may fetch independently. The per-user 30 requests/minute limit is likewise best-effort per isolate. For larger-scale use add durable caching and gateway throttling before increasing traffic. Failed source refreshes return an explicit 502, not silently stale data.

Deployment endpoint and final smoke-test evidence are recorded below after deployment. Deployment does not publish the frontend; the UI owner must build/publish it separately.
