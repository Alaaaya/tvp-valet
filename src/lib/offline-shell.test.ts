import {describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {renderServiceWorker} from '../../vite.config';
import {registerOfflineShell} from './offline-shell';
const tpl = readFileSync('src/offline/sw.template.js', 'utf8');
describe('service worker template', () => {
  const out = renderServiceWorker(tpl, 'a'.repeat(64), '/tvp-valet/', ['assets/a.js', 'index.html', 'assets/a.js']);
  it('injects version, base and deduped sorted precache', () => {
    expect(out).toContain("'aaaaaaaaaaaaaaaa'"); expect(out).toContain("'/tvp-valet/'");
    expect(out).toContain('["assets/a.js","index.html"]'); expect(out).not.toMatch(/__[A-Z]+__/);
  });
  it('has no automatic skipWaiting or claim and never caches api', () => {
    expect(out).not.toMatch(/install'[\s\S]*skipWaiting\(\)[\s\S]*activate/);
    expect(out).not.toContain('clients.claim');
    expect(out).toContain('url.origin !== self.location.origin');
  });
  it('runs: installs, serves shell offline, rejects partial install, keeps old cache', async () => {
    const stores = new Map<string, Map<string, Response>>();
    const mk = (n: string) => { if (!stores.has(n)) stores.set(n, new Map()); const m = stores.get(n)!; return {put: async (k: string, r: Response) => void m.set(k, r), match: async (k: string) => m.get(k)}; };
    stores.set('tvp-shell-old', new Map());
    const handlers: Record<string, (e: any) => void> = {};
    let online = true; let failing = '';
    const sandbox: any = {
      self: {location: new URL('https://x.test/tvp-valet/sw.js'), addEventListener: (n: string, f: any) => { handlers[n] = f; }, skipWaiting: vi.fn(), clients: {matchAll: async () => [{}]}},
      caches: {open: async (n: string) => mk(n), delete: async (n: string) => stores.delete(n), keys: async () => [...stores.keys()],
        match: async (k: string, o: any) => stores.get(o.cacheName)?.get(k)},
      fetch: async (r: any) => { const u = r.url ?? r; if (!online) throw new Error('off'); if (failing && u.endsWith(failing)) return new Response('', {status: 500}); return new Response('body:' + u); },
      Request: class { url: string; mode?: string; method = 'GET'; constructor(u: string) { this.url = u; } },
      Response, URL,
    };
    new Function(...Object.keys(sandbox), out)(...Object.values(sandbox));
    let p: Promise<unknown> = Promise.resolve(); handlers.install({waitUntil: (x: any) => { p = x; }}); await p;
    expect([...stores.get('tvp-shell-aaaaaaaaaaaaaaaa')!.keys()]).toEqual(['https://x.test/tvp-valet/assets/a.js', 'https://x.test/tvp-valet/index.html']);
    handlers.activate({waitUntil: (x: any) => { p = x; }}); await p;
    expect(stores.has('tvp-shell-old')).toBe(true); // old client may still run
    online = false; let res: any;
    handlers.fetch({request: {method: 'GET', url: 'https://x.test/tvp-valet/', mode: 'navigate'}, respondWith: (x: any) => { res = x; }});
    expect(await (await res).text()).toContain('index.html');
    res = undefined;
    handlers.fetch({request: {method: 'GET', url: 'https://api.test/rest/v1/bookings', mode: 'cors'}, respondWith: (x: any) => { res = x; }});
    expect(res).toBeUndefined();
    handlers.fetch({request: {method: 'GET', url: 'https://x.test/rest/v1/bookings', mode: 'cors'}, respondWith: (x: any) => { res = x; }});
    expect(res).toBeUndefined();
    stores.delete('tvp-shell-aaaaaaaaaaaaaaaa'); online = true; failing = 'a.js';
    p = Promise.resolve(); handlers.install({waitUntil: (x: any) => { p = x; }});
    await expect(p).rejects.toThrow(); expect(stores.has('tvp-shell-aaaaaaaaaaaaaaaa')).toBe(false);
  });
});
describe('registerOfflineShell', () => {
  function fake(reg: any) {
    const l: Record<string, any> = {};
    return {container: {register: vi.fn(async () => reg), addEventListener: (n: string, f: any) => { l[n] = f; }, controller: {}} as any, l};
  }
  it('unsupported without container', async () => {
    const s = vi.fn(); expect(await registerOfflineShell({isBlocked: () => false, onState: s, container: undefined, baseUrl: '/'} as any)).toBeNull();
  });
  it('reports error on failed register, never ready', async () => {
    const s = vi.fn(); const c = {register: async () => { throw new Error('x'); }, addEventListener() {}} as any;
    await registerOfflineShell({isBlocked: () => false, onState: s, container: c, baseUrl: '/tvp-valet/'});
    expect(s).toHaveBeenLastCalledWith('error'); expect(s).not.toHaveBeenCalledWith('ready');
  });
  it('does not apply update while blocked', async () => {
    const post = vi.fn(); let blocked = true;
    const reg = {active: {}, waiting: {postMessage: post}, installing: null, addEventListener() {}};
    const {container} = fake(reg);
    const h = await registerOfflineShell({isBlocked: () => blocked, container, baseUrl: '/tvp-valet/', onState: () => {}});
    expect(container.register).toHaveBeenCalledWith('/tvp-valet/sw.js', {scope: '/tvp-valet/'});
    expect(h!.applyUpdate()).toBe(false); expect(post).not.toHaveBeenCalled();
    blocked = false; expect(h!.applyUpdate()).toBe(true); expect(post).toHaveBeenCalledWith({type: 'SKIP_WAITING'});
  });
});
