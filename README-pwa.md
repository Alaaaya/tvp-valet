# Home screen install (PWA)

iPhone: open the app in Safari, tap Share, then "Zum Home-Bildschirm". Android/Chrome: menu, "App installieren".

The app has no service worker and caches no customer data; it always needs a connection.

Login is kept by the browser session. Caveats: the home screen app uses its own storage, so you may need to sign in once again after installing. Private browsing, cleared site data, OS cleanup, or a revoked session require a new sign-in. Persistence is not guaranteed.

Hosted at base /tvp-valet/ (VITE_BASE_PATH); the URL hash keeps working.
