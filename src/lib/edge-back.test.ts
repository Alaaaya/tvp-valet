import { describe, it, expect } from 'vitest';
import { decideIntent, shouldComplete, isEdgeStart, shouldUseCustomGesture, isExcludedTarget, createRegistry, createController, registry } from './edge-back';

const mkRoot = () => { const cls = new Set<string>(); return { style: { transform: 'x' } as any, offsetWidth: 400, classList: { add: (c: string) => cls.add(c), remove: (c: string) => cls.delete(c) }, cls }; };
function setup(onBack: () => any = () => {}, over: any = {}) {
  const root = mkRoot(); let t = 0; let clip = 0;
  const entry = registry.add({ root, priority: 1, enabled: true, blocked: false, ...over });
  const c = createController({ root: () => root as any, entry: () => entry, onBack, reducedMotion: () => true, viewportWidth: () => 400, now: () => (t += 16), clip: { set: () => clip++, restore: () => clip-- } });
  return { root, entry, c, clip: () => clip };
}
describe('edge helpers', () => {
  it('edge start', () => { expect(isEdgeStart(20)).toBe(true); expect(isEdgeStart(21)).toBe(false); });
  it('intent', () => {
    expect(decideIntent(5, 0)).toBe('pending');
    expect(decideIntent(10, 2)).toBe('horizontal');
    expect(decideIntent(10, 9)).toBe('pending');
    expect(decideIntent(2, 10)).toBe('vertical');
  });
  it('complete thresholds', () => {
    expect(shouldComplete(133, 400, 0)).toBe(true);
    expect(shouldComplete(100, 400, 0.1)).toBe(false);
    expect(shouldComplete(50, 400, 0.6)).toBe(true);
    expect(shouldComplete(30, 400, 2)).toBe(false);
  });
  it('native gating', () => {
    const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
    expect(shouldUseCustomGesture({ userAgent: ios })).toBe(false);
    expect(shouldUseCustomGesture({ userAgent: ios, standalone: true })).toBe(true);
    expect(shouldUseCustomGesture({ userAgent: 'Android Chrome' })).toBe(true);
  });
  it('exclusions', () => {
    const root: any = {};
    const btn: any = { closest: () => ({}), parentElement: root };
    expect(isExcludedTarget(btn, root)).toBe(true);
    const form: any = { closest: () => null, parentElement: root };
    expect(isExcludedTarget(form, root)).toBe(false);
    const sc: any = { closest: () => null, parentElement: root, scrollWidth: 900, clientWidth: 300, __overflowX: 'auto' };
    const kid: any = { closest: () => null, parentElement: sc };
    expect(isExcludedTarget(kid, root)).toBe(true);
  });
  it('registry nested priority + blocked', () => {
    const r = createRegistry();
    const a = r.add({ root: 1, priority: 1, enabled: true, blocked: false });
    const b = r.add({ root: 2, priority: 5, enabled: true, blocked: false });
    expect(r.active()).toBe(b);
    b.blocked = true; expect(r.active()).toBe(null);
    b.blocked = false; b.enabled = false; expect(r.active()).toBe(a);
    const c = r.add({ root: 3, priority: 1, enabled: true, blocked: false });
    expect(r.active()).toBe(c);
  });
});
describe('controller', () => {
  it('completes once and restores styles', () => {
    let n = 0; const s = setup(() => { n++; });
    expect(s.c.start(1, 5, 100, null)).toBe(true);
    expect(s.c.move(1, 20, 101)).toBe(true);
    expect(s.c.move(1, 200, 102)).toBe(true);
    s.c.end(1); s.c.end(1);
    expect(n).toBe(1); expect(s.c.phase).toBe('idle'); expect(s.root.style.transform).toBe('x'); expect(s.clip()).toBe(0);
    registry.remove(s.entry);
  });
  it('cancels below threshold', () => {
    let n = 0; const s = setup(() => { n++; });
    s.c.start(1, 5, 100, null); s.c.move(1, 20, 100); s.c.move(1, 40, 100); s.c.end(1);
    expect(n).toBe(0); expect(s.root.style.transform).toBe('x'); registry.remove(s.entry);
  });
  it('vertical rejects early, mid-screen start ignored', () => {
    const s = setup();
    s.c.start(1, 5, 100, null); expect(s.c.move(1, 6, 120)).toBe(false); expect(s.c.phase).toBe('idle');
    expect(s.c.start(2, 100, 100, null)).toBe(false); registry.remove(s.entry);
  });
  it('guard rejection restores', async () => {
    const s = setup(() => false);
    s.c.start(1, 5, 100, null); s.c.move(1, 20, 100); s.c.move(1, 300, 100); s.c.end(1);
    expect(s.c.phase).toBe('idle'); expect(s.root.style.transform).toBe('x'); registry.remove(s.entry);
  });
  it('external dialog blocks start', () => {
    let b = true; const root = mkRoot(); const entry = registry.add({ root, priority: 1, enabled: true, blocked: false });
    const c = createController({ root: () => root as any, entry: () => entry, onBack: () => {}, reducedMotion: () => true, viewportWidth: () => 400, now: () => 1, externalBlocked: () => b });
    expect(c.start(1, 5, 5, null)).toBe(false); b = false; expect(c.start(1, 5, 5, null)).toBe(true); c.cancel(); registry.remove(entry);
  });
  it('stale velocity after hold is not a flick', () => {
    let n = 0; let now = 0; const root = mkRoot(); const entry = registry.add({ root, priority: 1, enabled: true, blocked: false });
    const c = createController({ root: () => root as any, entry: () => entry, onBack: () => { n++; }, reducedMotion: () => true, viewportWidth: () => 400, now: () => now });
    c.start(1, 5, 0, null); now = 10; c.move(1, 25, 0); now = 20; c.move(1, 60, 0); now = 400; c.end(1);
    expect(n).toBe(0); registry.remove(entry);
  });
  it('root change mid-drag cancels', () => {
    let cur: any = mkRoot(); const entry = registry.add({ root: cur, priority: 1, enabled: true, blocked: false });
    const c = createController({ root: () => cur, entry: () => entry, onBack: () => {}, reducedMotion: () => true, viewportWidth: () => 400, now: () => 1 });
    c.start(1, 5, 0, null); c.move(1, 30, 0); cur = mkRoot(); c.move(1, 60, 0);
    expect(c.phase).toBe('idle'); registry.remove(entry);
  });
  it('disabled mid-drag cancels', () => {
    const s = setup(); s.c.start(1, 5, 0, null); s.c.move(1, 30, 0); s.entry.enabled = false; s.c.move(1, 60, 0);
    expect(s.c.phase).toBe('idle'); expect(s.root.style.transform).toBe('x'); registry.remove(s.entry);
  });
  it('disabled / blocked / lower priority cannot start; cancel cleans', () => {
    const s = setup(); const top = registry.add({ root: 9, priority: 9, enabled: true, blocked: false });
    expect(s.c.start(1, 5, 5, null)).toBe(false);
    top.blocked = true; expect(s.c.start(1, 5, 5, null)).toBe(false);
    registry.remove(top);
    s.c.start(1, 5, 100, null); s.c.move(1, 30, 100); s.c.cancel();
    expect(s.c.phase).toBe('idle'); expect(s.clip()).toBe(0); expect(s.root.style.transform).toBe('x');
    registry.remove(s.entry);
  });
});
