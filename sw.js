/* Offline app shell. Generated values are injected by vite.config.ts. Never caches API data. */
const VERSION = '448bf4d8bfabd2ff';
const BASE = '/tvp-valet/';
const PRECACHE = ["assets/booking-scan-ocr-B7qE9U8p.js","assets/booking-scan-sheet-8RYe6Fbd.js","assets/booking-scan-sheet-Bc9I27Om.css","assets/index-CidrTPxn.js","assets/index-D4o8CnPd.css","assets/occupancy-chart-2mYidB4_.js","assets/print-sheets-Cqk9RbfG.js","assets/print-short-D7gQ7fUC.js","assets/print-text-BkVo7gzQ.js","assets/rolldown-runtime-C0FnF6B9.js","assets/src-SuYvKHvm.js","assets/tesseract-core-lstm.wasm-DhgzXyTR.js","assets/tesseract-core-simd-lstm.wasm-D4IWHdQk.js","assets/worker.min-32WLk7pY.js","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","icons/maskable-512.png","index.html","manifest.webmanifest","ocr/eng.traineddata.gz","print/FONTS-LICENSE.txt","print/LiberationSans-Bold.ttf","print/LiberationSans-Regular.ttf","print/booking-template.pdf","print/cars@2x.png","print/logo.png"];
const PREFIX = 'tvp-shell-';
const CACHE = PREFIX + VERSION;
const scope = new URL(BASE, self.location.origin);
const abs = p => new URL(p, scope).href;
const PRECACHE_SET = new Set(PRECACHE.map(abs));
const SHELL = abs('index.html');

self.addEventListener('install', event => {
  // Any failed asset rejects install, so a partial cache never becomes active.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await Promise.all(PRECACHE.map(async p => {
        const res = await fetch(new Request(abs(p), {cache: 'reload'}));
        if (!res.ok) throw new Error('precache ' + p + ' ' + res.status);
        await cache.put(abs(p), res);
      }));
    } catch (e) { await caches.delete(CACHE); throw e; }
  })());
});

async function cleanup() {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)));
}
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Keep the old cache while any open page may still run the old version.
    const clients = await self.clients.matchAll({includeUncontrolled: true});
    if (clients.length === 0) await cleanup();
  })());
});

self.addEventListener('message', event => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  else if (type === 'CLEANUP') event.waitUntil(cleanup());
  else if (type === 'STATUS') event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let cached = 0;
    for (const u of PRECACHE_SET) if (await cache.match(u)) cached++;
    event.source && event.source.postMessage({type: 'STATUS', version: VERSION, cached, total: PRECACHE_SET.size});
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(req); }
      catch { const hit = await caches.match(SHELL, {cacheName: CACHE}); return hit || Response.error(); }
    })());
    return;
  }
  const key = url.origin + url.pathname;
  if (!PRECACHE_SET.has(key) || url.pathname.endsWith('/version.json')) return;
  event.respondWith((async () => (await caches.match(key, {cacheName: CACHE})) || fetch(req))());
});
