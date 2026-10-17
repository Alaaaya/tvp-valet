# TVP Valet
Mobile-first German dispatch application for Travel Valet Parking, independent of ParkingPro.

Status: interactive demo and backend implementation complete. NOT live or production-ready. Supabase account access is blocked; no remote project or employee credentials have been created. Demo uses in-memory example data and resets on reload. No real customer data or secrets are committed.

Run npm install, npm run dev, npm test and npm run build. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env after following README-backend.md. Never put service-role keys in frontend variables.

Includes daily arrivals/returns, date/filter/search, booking detail, admin create/edit, driver check-in/out, key/cash/parking spots, private photo client, created-day list, CSV/JSON imports, employee role client and cash summary. Product tariff editor and employee onboarding UI remain unfinished. Flight times are manually entered, not live. Email/platform ingestion is phase 2. Arabic UI is not yet included.

Private source repository. Frontend static assets alone contain no private data. GitHub Pages is unavailable for this private repository on the account's free plan. Surge deployment currently awaits account email verification and returns 403, so do not describe it as live. A temporary preview may be exposed separately but is not permanent hosting.

Unit tests cover tariff/timezone/cash/demo behavior. check-ui.mjs runs Playwright against port 46183 and covers mobile navigation, create/search/check-in/out, invalid checkout and import; configure installed Chrome path if needed. Backend security regression tests have separate setup in README-backend.md.
