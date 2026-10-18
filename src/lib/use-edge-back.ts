import { useEffect, useRef, type RefObject } from 'react';
import {
  createController,
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
}

const getOx = (el: ElementLike) =>
  typeof getComputedStyle === 'function' ? getComputedStyle(el as Element).overflowX : 'visible';

export function useEdgeBack(ref: RefObject<HTMLElement | null>, opts: EdgeBackOptions): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const entryRef = useRef<RegEntry | null>(null);

  // keep registry entry in sync
  useEffect(() => {
    const e = entryRef.current;
    if (e) {
      e.enabled = opts.enabled;
      e.blocked = !!opts.blocked;
      e.priority = opts.priority;
    }
  });

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
      entry: () => (entry.root === ref.current ? entry : null),
      onBack: () => optsRef.current.onBack(),
      reducedMotion: () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      viewportWidth: () => window.innerWidth,
      now: () => performance.now(),
      clip: {
        set: () => { prevOx = html.style.overflowX; html.style.overflowX = 'clip'; },
        restore: () => { html.style.overflowX = prevOx; },
      },
    });
    const inRoot = (t: EventTarget | null) => !!(t && ref.current && ref.current.contains(t as Node));
    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length > 1) { ctl.cancel(); return; }
      const t = ev.touches[0];
      if (!inRoot(ev.target)) return;
      ctl.start(t.identifier, t.clientX, t.clientY, ev.target as unknown as ElementLike, getOx);
    };
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length > 1) { ctl.cancel(); return; }
      const t = ev.touches[0];
      if (ctl.move(t.identifier, t.clientX, t.clientY) && ev.cancelable) ev.preventDefault();
    };
    const onTouchEnd = (ev: TouchEvent) => { const t = ev.changedTouches[0]; if (t) ctl.end(t.identifier); };
    const onCancel = () => ctl.cancel();
    const onVis = () => { if (document.visibilityState !== 'visible') ctl.cancel(); };
    const onPtrDown = (ev: PointerEvent) => {
      if (ev.pointerType === 'touch' || !ev.isPrimary || !inRoot(ev.target)) return;
      ctl.start('p' + ev.pointerId, ev.clientX, ev.clientY, ev.target as unknown as ElementLike, getOx);
    };
    const onPtrMove = (ev: PointerEvent) => { if (ev.pointerType !== 'touch') ctl.move('p' + ev.pointerId, ev.clientX, ev.clientY); };
    const onPtrUp = (ev: PointerEvent) => { if (ev.pointerType !== 'touch') ctl.end('p' + ev.pointerId); };
    const on = [
      ['touchstart', onTouchStart, { passive: true }],
      ['touchmove', onTouchMove, { passive: false }],
      ['touchend', onTouchEnd, { passive: true }],
      ['touchcancel', onCancel, { passive: true }],
      ['pointerdown', onPtrDown, { passive: true }],
      ['pointermove', onPtrMove, { passive: true }],
      ['pointerup', onPtrUp, { passive: true }],
      ['pointercancel', onCancel, { passive: true }],
    ] as const;
    for (const [n, f, p] of on) window.addEventListener(n, f as EventListener, p);
    window.addEventListener('blur', onCancel);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      for (const [n, f] of on) window.removeEventListener(n, f as EventListener);
      window.removeEventListener('blur', onCancel);
      document.removeEventListener('visibilitychange', onVis);
      ctl.destroy();
      registry.remove(entry);
      entryRef.current = null;
    };
  }, [ref]);
}
