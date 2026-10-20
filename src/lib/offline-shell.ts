/** Registers the offline shell worker. Called from main later; never reloads on its own. */
export type OfflineShellState = 'unsupported' | 'installing' | 'ready' | 'waiting' | 'error';
export interface OfflineShellOptions {
  isBlocked: () => boolean; // drafts or outbox pending
  baseUrl?: string;
  onState?: (state: OfflineShellState) => void;
  reload?: () => void;
  container?: ServiceWorkerContainer;
}
export function offlineShellSupported(container: ServiceWorkerContainer | undefined = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker): container is ServiceWorkerContainer {
  return !!container;
}
export async function registerOfflineShell(options: OfflineShellOptions) {
  const container = options.container ?? (typeof navigator === 'undefined' ? undefined : navigator.serviceWorker);
  const emit = options.onState ?? (() => {});
  if (!container) { emit('unsupported'); return null; }
  const base = options.baseUrl ?? import.meta.env.BASE_URL;
  let state: OfflineShellState = 'installing';
  const set = (s: OfflineShellState) => { state = s; emit(s); };
  let applying = false;
  container.addEventListener('controllerchange', () => { if (applying) (options.reload ?? (() => location.reload()))(); });
  try {
    const reg = await container.register(base + 'sw.js', {scope: base});
    const watch = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const onChange = () => {
        if (worker.state === 'redundant') set(reg.active ? state : 'error');
        else if (worker.state === 'activated') set('ready');
        else if (worker.state === 'installed' && reg.active && container.controller) set('waiting');
      };
      worker.addEventListener('statechange', onChange); onChange();
    };
    if (reg.active && !reg.installing && !reg.waiting) set('ready'); // installed earlier: install only succeeds with a full cache
    watch(reg.installing); if (reg.waiting) set('waiting');
    reg.addEventListener('updatefound', () => watch(reg.installing));
    return {
      get state() { return state; },
      update: () => reg.update(),
      /** Only activates a waiting version when nothing unsaved exists; returns whether it was applied. */
      applyUpdate(): boolean {
        if (!reg.waiting || options.isBlocked()) return false;
        applying = true; reg.waiting.postMessage({type: 'SKIP_WAITING'}); return true;
      },
    };
  } catch { set('error'); return null; }
}
