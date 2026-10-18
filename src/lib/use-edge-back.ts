import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import {
  createClickSuppressor,
  createController,
  dialogsBlock,
  registry,
  shouldUseCustomGesture,
  type BackResult,
  type ElementLike,
  type RegEntry,
} from './edge-back';

export interface EdgeBackOptions {
  enabled: boolean;
  onBack: () => BackResult; // return false (or reject) to refuse; void = allowed
  priority: number;
  blocked?: boolean;
  /** change (e.g. selected booking id) cancels the current gesture even if the DOM root is reused */
  key?: unknown;
}

const getOx = (el: ElementLike) =>
  typeof getComputedStyle === 'function' ? getComputedStyle(el as Element).overflowX : 'visible';

/** a visible modal/alert dialog outside the root blocks swiping the page underneath */
function hasForeignDialog(root: HTMLElement | null): boolean {
  if (typeof document === 'undefined') return false;
  const ds = Array.from(document.querySelectorAll<HTMLElement>(
    '[role="alertdialog"],[role="dialog"],dialog[open],[aria-modal="true"],[data-edge-back-modal]',
  ));
  return dialogsBlock(ds, root, (d) => !!root && d.contains(root), (el) =>
    !el.hidden && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0);
}

/** register a blocker (e.g. a custom payment confirm) that stops lower back gestures while active */
export function useEdgeBackBlock(active: boolean, priority = 1000): void {
  useEffect(() => {
    if (!active) return;
    const e = registry.add({ root: null, priority, enabled: true, blocked: true });
    return () => registry.remove(e);
  }, [active, priority]);
}

export function useEdgeBack(ref: RefObject<HTMLElement | null>, opts: EdgeBackOptions): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const entryRef = useRef<RegEntry | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  // keep registry entry in sync; cancel a running drag when scope changes
  useLayoutEffect(() => {
    const e = entryRef.current;
    if (e) e.root = ref.current;
    if (e) {
      e.enabled = opts.enabled;
      e.blocked = !!opts.blocked;
      e.priority = opts.priority;
    }
    cancelRef.current?.(); // enabled/blocked/priority changed: never keep a stale drag
  }, [opts.enabled, opts.blocked, opts.priority]);
  useEffect(() => () => cancelRef.current?.(), [opts.key]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const use = shouldUseCustomGesture({
      userAgent: nav.userAgent,
      maxTouchPoints: nav.maxTouchPoints,
      platform: nav.platform,
      standalone: nav.standalone,
      displayModeStandalone: window.matchMedia?.('(display-mode: standalone)').matches,
    });
    if (!use) return;
    const o = optsRef.current;
    const entry = registry.add({ root: ref.current, priority: o.priority, enabled: o.enabled, blocked: !!o.blocked });
    entryRef.current = entry;
    const html = document.documentElement;
    let prevOx = '';
    const ctl = createController({
      root: () => {
        const r = ref.current;
        entry.root = r;
        return r as never;
      },
      entry: () => {
        entry.root = ref.current; // root may mount after the hook (login -> app)
        return ref.current ? entry : null;
      },
      externalBlocked: () => hasForeignDialog(ref.current),
      onBack: () => optsRef.current.onBack(),
      reducedMotion: () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      viewportWidth: () => window.innerWidth,
      now: () => performance.now(),
      clip: {
        set: () => { prevOx = html.style.overflowX; html.style.overflowX = 'clip'; },
        restore: () => { html.style.overflowX = prevOx; },
      },
    });
    cancelRef.current = () => ctl.cancel();
    const rel = (a: unknown, b: unknown) => {
      const x = a as Node | null, y = b as Node | null;
      return !!x && !!y && (x === y || x.contains(y) || y.contains(x));
    };
    const sup = createClickSuppressor(() => performance.now(), rel);
    let ownerId: unknown = null; // input id this hook's controller locked
    let originEl: EventTarget | null = null;
    let startId: unknown = null, startEl: EventTarget | null = null;
    const lockMove = (id: unknown, v: boolean) => {
      if (v && ownerId === null) { ownerId = id; sup.lock(id, startEl); originEl = startEl; }
      return v;
    };
    const releaseInput = (id: unknown) => { if (ownerId !== null && id === ownerId) { sup.release(id); ownerId = null; } };
    const onClick = (ev: MouseEvent) => {
      if (sup.consume({ target: ev.target, detail: ev.detail })) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
      }
    };
    const onFresh = (id: unknown, el: EventTarget | null) => { sup.fresh(); ownerId = null; originEl = null; startId = id; startEl = el; };
    const onKey = () => sup.clear();
    const inRoot = (t: EventTarget | null) => !!(t && ref.current && ref.current.contains(t as Node));
    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length > 1) { ctl.cancel(); return; }
      const t = ev.touches[0];
      onFresh(t.identifier, ev.target);
      if (!inRoot(ev.target)) return;
      ctl.start(t.identifier, t.clientX, t.clientY, ev.target as unknown as ElementLike, getOx);
    };
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length > 1) { ctl.cancel(); return; }
      const t = ev.touches[0];
      if (lockMove(t.identifier, ctl.move(t.identifier, t.clientX, t.clientY)) && ev.cancelable) ev.preventDefault();
    };
    const onTouchEnd = (ev: TouchEvent) => { const t = ev.changedTouches[0]; if (t) { releaseInput(t.identifier); ctl.end(t.identifier); } };
    const onTouchCancel = (ev: TouchEvent) => { const t = ev.changedTouches[0]; if (t) releaseInput(t.identifier); ctl.cancel(); };
    const onPtrCancel = (ev: PointerEvent) => { if (ev.pointerType !== 'touch') releaseInput('p' + ev.pointerId); ctl.cancel(); };
    const onCancel = () => { if (ownerId !== null) { sup.release(ownerId); ownerId = null; } ctl.cancel(); };
    const onVis = () => { if (document.visibilityState !== 'visible') ctl.cancel(); };
    const onPtrDown = (ev: PointerEvent) => {
      if (ev.pointerType === 'touch') return;
      onFresh('p' + ev.pointerId, ev.target);
      if (!ev.isPrimary || !inRoot(ev.target)) return;
      ctl.start('p' + ev.pointerId, ev.clientX, ev.clientY, ev.target as unknown as ElementLike, getOx);
    };
    const onPtrMove = (ev: PointerEvent) => { if (ev.pointerType !== 'touch') lockMove('p' + ev.pointerId, ctl.move('p' + ev.pointerId, ev.clientX, ev.clientY)); };
    const onPtrUp = (ev: PointerEvent) => { if (ev.pointerType !== 'touch') { releaseInput('p' + ev.pointerId); ctl.end('p' + ev.pointerId); } };
    const on = [
      ['touchstart', onTouchStart, { passive: true }],
      ['touchmove', onTouchMove, { passive: false }],
      ['touchend', onTouchEnd, { passive: true }],
      ['touchcancel', onTouchCancel, { passive: true }],
      ['pointerdown', onPtrDown, { passive: true }],
      ['pointermove', onPtrMove, { passive: true }],
      ['pointerup', onPtrUp, { passive: true }],
      ['pointercancel', onPtrCancel, { passive: true }],
    ] as const;
    for (const [n, f, p] of on) window.addEventListener(n, f as EventListener, p);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onCancel);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      for (const [n, f] of on) window.removeEventListener(n, f as EventListener);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onCancel);
      document.removeEventListener('visibilitychange', onVis);
      ctl.destroy();
      cancelRef.current = null;
      registry.remove(entry);
      entryRef.current = null;
    };
  }, [ref]);
}
