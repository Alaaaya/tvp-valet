export const EDGE_START_PX = 20;
export const LOCK_PX = 8;
export const LOCK_RATIO = 1.3;
export const COMPLETE_RATIO = 0.33;
export const FLICK_VELOCITY = 0.5; // px/ms
export const FLICK_MIN_PX = 40;

export type Intent = 'pending' | 'horizontal' | 'vertical';
export type BackResult = void | boolean | Promise<void | boolean>; // false = rejected by guard

export function isEdgeStart(x: number): boolean {
  return x >= 0 && x <= EDGE_START_PX;
}

export function decideIntent(dx: number, dy: number): Intent {
  const ady = Math.abs(dy);
  if (ady > LOCK_PX && ady >= Math.abs(dx)) return 'vertical';
  if (dx > LOCK_PX && dx > ady * LOCK_RATIO) return 'horizontal';
  if (ady > LOCK_PX && dx <= LOCK_PX) return 'vertical';
  if (dx < -LOCK_PX) return 'vertical';
  return 'pending';
}

export function shouldComplete(dx: number, width: number, velocity: number): boolean {
  if (dx >= width * COMPLETE_RATIO && dx > 0) return true;
  return velocity >= FLICK_VELOCITY && dx >= FLICK_MIN_PX;
}

export function clampDrag(dx: number, width: number): number {
  return Math.max(0, Math.min(dx, width));
}

/** iOS Safari/Chrome browsers have their own edge-swipe; only standalone PWAs need ours. */
export function shouldUseCustomGesture(env: {
  userAgent: string;
  maxTouchPoints?: number;
  platform?: string;
  standalone?: boolean;
  displayModeStandalone?: boolean;
}): boolean {
  const ua = env.userAgent || '';
  const ios =
    /iPad|iPhone|iPod/.test(ua) || (env.platform === 'MacIntel' && (env.maxTouchPoints ?? 0) > 1);
  if (!ios) return true;
  return !!(env.standalone || env.displayModeStandalone);
}

const EXCLUDE_SELECTOR =
  'input,select,textarea,button,a,[contenteditable]:not([contenteditable="false"]),canvas,video,audio,[role="slider"],[data-edge-back-exclude]';

export interface ElementLike {
  closest?(sel: string): ElementLike | null;
  parentElement?: ElementLike | null;
  scrollWidth?: number;
  clientWidth?: number;
  __overflowX?: string;
}

/** getOverflowX injected so it works without a DOM. */
export function isExcludedTarget(
  target: ElementLike | null | undefined,
  root: ElementLike | null | undefined,
  getOverflowX: (el: ElementLike) => string = (el) => el.__overflowX ?? 'visible',
): boolean {
  if (!target) return false;
  if (target.closest && target.closest(EXCLUDE_SELECTOR)) return true;
  for (let el: ElementLike | null | undefined = target; el; el = el.parentElement) {
    const ox = getOverflowX(el);
    if (
      (ox === 'auto' || ox === 'scroll') &&
      (el.scrollWidth ?? 0) > (el.clientWidth ?? 0)
    )
      return true;
    if (el === root) break;
  }
  return false;
}

/* ---------- registry ---------- */
export interface RegEntry {
  id: number;
  root: unknown;
  priority: number;
  enabled: boolean;
  blocked: boolean;
}
export function createRegistry() {
  const list: RegEntry[] = [];
  let seq = 0;
  return {
    add(e: Omit<RegEntry, 'id'>): RegEntry {
      const entry = { ...e, id: ++seq };
      list.push(entry);
      return entry;
    },
    remove(e: RegEntry) {
      const i = list.indexOf(e);
      if (i >= 0) list.splice(i, 1);
    },
    /** topmost enabled entry; if it is blocked nothing underneath may go back */
    active(): RegEntry | null {
      let best: RegEntry | null = null;
      for (const e of list) {
        if (!e.enabled) continue;
        if (!best || e.priority > best.priority || (e.priority === best.priority && e.id > best.id))
          best = e;
      }
      return best && !best.blocked ? best : null;
    },
    size: () => list.length,
  };
}
export const registry = createRegistry();

/* ---------- controller (pure, driven by abstract input) ---------- */
export interface RootLike {
  style: Record<string, string> & { setProperty?: unknown };
  classList: { add(c: string): void; remove(c: string): void };
  offsetWidth?: number;
  clientWidth?: number;
}
export interface ControllerOpts {
  root: () => RootLike | null;
  entry: () => RegEntry | null; // this hook's registry entry
  onBack: () => BackResult;
  reducedMotion: () => boolean;
  clip?: { set(): void; restore(): void }; // document overflow clip
  externalBlocked?: () => boolean;
  viewportWidth: () => number;
  now: () => number;
  settleMs?: number;
  schedule?: (fn: () => void, ms: number) => unknown;
  clearSchedule?: (h: unknown) => void;
}
type Phase = 'idle' | 'pending' | 'dragging' | 'settling';

export function createController(o: ControllerOpts) {
  let phase: Phase = 'idle';
  let id: unknown = null;
  let sx = 0, sy = 0, dx = 0, lastX = 0, lastT = 0, vel = 0, width = 1, raf = false;
  let saved: { transform: string; transition: string; willChange: string } | null = null;
  let timer: unknown = null;
  let epoch = 0;
  let boundRoot: RootLike | null = null;
  const settleMs = o.settleMs ?? 220;
  const schedule = o.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const clear = o.clearSchedule ?? ((h) => clearTimeout(h as never));

  const apply = (x: number) => {
    if (boundRoot) boundRoot.style.transform = x ? 'translate3d(' + x + 'px,0,0)' : '';
  };
  const begin = (r: RootLike) => {
    boundRoot = r;
    saved = { transform: r.style.transform ?? '', transition: r.style.transition ?? '', willChange: r.style.willChange ?? '' };
    r.style.willChange = 'transform';
    r.style.transition = 'none';
    r.classList.add('edge-back-dragging');
    o.clip?.set();
  };
  const cleanup = () => {
    if (timer != null) { clear(timer); timer = null; }
    const r = boundRoot;
    if (r && saved) {
      r.style.transform = saved.transform;
      r.style.transition = saved.transition;
      r.style.willChange = saved.willChange;
      r.classList.remove('edge-back-dragging');
      r.classList.remove('edge-back-settling');
      o.clip?.restore();
    }
    boundRoot = null; saved = null; phase = 'idle'; id = null; dx = 0;
  };
  const settle = (to: number, done: () => void) => {
    const r = boundRoot;
    if (!r) return done();
    phase = 'settling';
    const my = epoch;
    r.classList.remove('edge-back-dragging');
    r.classList.add('edge-back-settling');
    if (o.reducedMotion()) { apply(to); done(); return; }
    r.style.transition = 'transform ' + settleMs + 'ms cubic-bezier(.2,.8,.2,1)';
    apply(to);
    timer = schedule(() => { timer = null; if (my === epoch) done(); }, settleMs);
  };

  const self = {
    get phase() { return phase; },
    canStart(x: number, target: ElementLike | null, getOx?: (el: ElementLike) => string): boolean {
      if (phase !== 'idle') return false;
      if (!isEdgeStart(x)) return false;
      const e = o.entry(), top = registry.active();
      if (!e || !e.enabled || e.blocked || top !== e) return false;
      const r = o.root();
      if (!r) return false;
      if (o.externalBlocked?.()) return false;
      return !isExcludedTarget(target, r as unknown as ElementLike, getOx);
    },
    start(pid: unknown, x: number, y: number, target: ElementLike | null, getOx?: (el: ElementLike) => string): boolean {
      if (!self.canStart(x, target, getOx)) return false;
      phase = 'pending'; id = pid; sx = x; sy = y; dx = 0; lastX = x; lastT = o.now(); vel = 0; epoch++;
      return true;
    },
    /** returns true when the event should be preventDefault-ed */
    move(pid: unknown, x: number, y: number): boolean {
      if (pid !== id) return false;
      if (phase === 'dragging' && (boundRoot !== o.root() || o.entry()?.enabled === false || o.entry()?.blocked || o.externalBlocked?.())) { self.cancel(); return false; }
      if (phase === 'pending') {
        const intent = decideIntent(x - sx, y - sy);
        if (intent === 'vertical') { cleanup(); return false; }
        if (intent === 'pending') return false;
        const r = o.root(), e = o.entry();
        if (!r || !e || registry.active() !== e || o.externalBlocked?.()) { cleanup(); return false; }
        width = Math.max(1, r.offsetWidth || r.clientWidth || o.viewportWidth());
        begin(r);
        phase = 'dragging';
      }
      if (phase !== 'dragging') return false;
      const t = o.now();
      dx = clampDrag(x - sx, width);
      if (t > lastT) { const v = (x - lastX) / (t - lastT); vel = vel * 0.5 + v * 0.5; lastX = x; lastT = t; }
      if (!raf) { raf = true; apply(dx); raf = false; }
      return true;
    },
    end(pid: unknown): void {
      if (pid !== id) return;
      if (phase === 'pending') { cleanup(); return; }
      if (phase !== 'dragging') return;
      if (boundRoot !== o.root()) { self.cancel(); return; }
      if (o.now() - lastT > 100) vel = 0; // held still before release: not a flick
      const go = shouldComplete(dx, width, vel);
      const my = epoch;
      if (!go) { settle(0, cleanup); return; }
      settle(width, () => {
        if (my !== epoch) return;
        const e = o.entry();
        if (!e || !e.enabled || e.blocked || registry.active() !== e) { settle(0, cleanup); return; }
        let res: BackResult;
        try { res = o.onBack(); } catch { res = false; }
        const fin = (ok: void | boolean) => {
          if (my !== epoch) return;
          if (ok === false) settle(0, cleanup);
          else cleanup(); // parent unmounts / navigates; restore styles anyway
        };
        if (res && typeof (res as Promise<unknown>).then === 'function')
          (res as Promise<void | boolean>).then(fin, () => fin(false));
        else fin(res as void | boolean);
      });
    },
    cancel(): void {
      epoch++;
      if (phase !== 'idle') cleanup();
    },
    destroy() { self.cancel(); },
  };
  return self;
}
