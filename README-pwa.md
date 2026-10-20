# Home screen install (PWA)

iPhone: open the app in Safari, tap Share, then "Zum Home-Bildschirm". Android/Chrome: menu, "App installieren".

After a successful online visit, a service worker stores the versioned app shell and IndexedDB stores the signed-in account's accessible bookings and operations. Offline search covers only this device's saved records, not guaranteed full server history. The UI shows cache coverage and shell readiness. New bookings, imports, live flights and staff administration still require a connection.

Supported existing-booking changes and media are first committed durably to an account-and-role-scoped outbox. Pending changes and payments are visibly unconfirmed until the server acknowledges them. Reconnection replays immutable event UUIDs in order, with server deduplication and explicit conflicts rather than silent overwrites. Conflicts can be reviewed; discarding a queue tail is permanent and requires confirmation. Pending changes block sign-out and build activation.

Photos, videos and signatures captured for pending actions remain in IndexedDB until confirmation. Previously uploaded media is not downloaded for offline use automatically. Shared-device users should sign out after syncing and avoid sharing a browser profile. Local persistence is not guaranteed: private browsing, quota failures, OS eviction or clearing site data can remove cached records or unsynced changes. Never clear browser storage while the queue is pending.

Login is kept by the browser session. Caveats: the home screen app uses its own storage, so you may need to sign in once again after installing. Private browsing, cleared site data, OS cleanup, or a revoked session require a new sign-in. Persistence is not guaranteed.

Hosted at base /tvp-valet/ (VITE_BASE_PATH); the URL hash keeps working.
