import {t as tr} from './i18n';
/** Deployment checks never bypass a pending offline-shell update. */
export interface BuildUpdateEnvironment {
  fetch: (url: string, options: RequestInit) => Promise<Pick<Response, 'ok' | 'text'>>;
  visible: () => boolean;
  href: () => string;
  replace: (url: string) => void;
  windowEvents: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  documentEvents: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
  setTimeout: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
  setInterval: (callback: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
  now: () => number;
}
export interface BuildUpdateOptions {
  isBlocked: () => boolean;
  /** False defers navigation, e.g. until a waiting offline worker is explicitly applied. */
  beforeReplace?: () => Promise<boolean>;
  currentHash?: string;
  baseUrl?: string;
  timeoutMs?: number;
  env?: BuildUpdateEnvironment;
}
const HASH = /^[a-f0-9]{64}$/;
function browserEnvironment(): BuildUpdateEnvironment {
  return {
    fetch: (url, options) => window.fetch(url, options),
    visible: () => document.visibilityState === 'visible',
    href: () => window.location.href,
    replace: url => window.location.replace(url),
    windowEvents: window, documentEvents: document,
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id),
    setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: id => clearInterval(id),
    now: () => Date.now(),
  };
}
export function startBuildUpdates(options: BuildUpdateOptions) {
  const env = options.env ?? browserEnvironment();
  const current = options.currentHash ?? __BUILD_HASH__;
  const base = options.baseUrl ?? import.meta.env.BASE_URL;
  let disposed = false;
  let replaced = false;
  let pending: string | null = null;
  let inFlight: Promise<void> | null = null;
  let cancelRequest: (() => void) | null = null;
  let preparing = false;
  function flush(): void {
    if (disposed || replaced || !pending || !env.visible() || options.isBlocked()) return;
    const destination = new URL(env.href());
    // The deployment may still serve an old HTML document. Never loop on its v URL.
    if (destination.searchParams.get('v') === pending) return;
    const hash = pending;
    const replace = () => {
      // Forms, outbox, visibility, and the server version can change during SW lookup.
      if (disposed || replaced || pending !== hash || !env.visible() || options.isBlocked()) return;
      const latest = new URL(env.href());
      if (latest.searchParams.get('v') === hash) return;
      latest.searchParams.set('v', hash);
      replaced = true;
      env.replace(latest.href);
    };
    if (!options.beforeReplace) { replace(); return; }
    if (preparing) return;
    preparing = true;
    void Promise.resolve().then(() => options.beforeReplace!()).then(ready => {
      if (ready) replace();
    }).catch(() => { /* Cannot confirm the offline worker is safe: retry on the next wake. */ })
      .finally(() => { preparing = false; });
  }
  function check(): Promise<void> {
    if (disposed || replaced || !env.visible()) return Promise.resolve();
    if (inFlight) return inFlight;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      cancel = () => { controller.abort(); reject(new Error(tr("Deployment check cancelled"))); };
      timer = env.setTimeout(cancel, options.timeoutMs ?? 10_000);
    });
    cancelRequest = cancel;
    const request = (async () => {
      const url = new URL('version.json', new URL(base, env.href()));
      url.searchParams.set('_ts', String(env.now()));
      const response = await env.fetch(url.href, {cache: 'no-store', signal: controller.signal});
      if (!response.ok) return null;
      const text = await response.text();
      if (text.length > 4096) return null;
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      const record = value as Record<string, unknown>;
      if (Object.keys(record).length !== 1 || typeof record.hash !== 'string' || !HASH.test(record.hash)) return null;
      return record.hash;
    })();
    inFlight = Promise.race([request, cancelled]).then(hash => {
      if (disposed || controller.signal.aborted || !hash) return;
      pending = hash === current ? null : hash;
      flush();
    }).catch(() => { /* Offline, malformed, or aborted: leave the app untouched. */ }).finally(() => {
      if (timer !== undefined) env.clearTimeout(timer);
      cancelRequest = null;
      inFlight = null;
    });
    return inFlight;
  }
  const wake = () => { if (env.visible()) { flush(); void check(); } };
  env.windowEvents.addEventListener('focus', wake);
  env.documentEvents.addEventListener('visibilitychange', wake);
  const interval = env.setInterval(wake, 60_000);
  void check();
  return {check, flush, dispose() {
    if (disposed) return;
    disposed = true;
    pending = null;
    env.clearInterval(interval);
    env.windowEvents.removeEventListener('focus', wake);
    env.documentEvents.removeEventListener('visibilitychange', wake);
    cancelRequest?.();
  }};
}

/** Refresh the registration before navigating so new HTML cannot outrun its offline cache.
 * Waiting/installing workers are applied only through the existing guarded update UI.
 * Lookup/update failures defer, rather than risk retaining an obsolete offline shell.
 */
export async function offlineShellAllowsBuildReplace(
  container: Pick<ServiceWorkerContainer, 'getRegistration'> | undefined = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
  baseUrl = import.meta.env.BASE_URL,
  href = typeof location === 'undefined' ? 'http://localhost/' : location.href,
): Promise<boolean> {
  if (!container) return true;
  const registration = await container.getRegistration(new URL(baseUrl, href).href);
  if (!registration) return true;
  if (registration.waiting || registration.installing) return false;
  await registration.update();
  return !registration.waiting && !registration.installing;
}
