import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {startBuildUpdates, type BuildUpdateEnvironment} from './build-update';
const OLD = 'a'.repeat(64), NEW = 'b'.repeat(64);
function setup() {
  let visible = true, blocked = false;
  let href = 'https://example.com/tvp-valet/?date=2026-10-17&x=1#booking-12';
  const windowEvents = new EventTarget(), documentEvents = new EventTarget();
  const fetch = vi.fn<BuildUpdateEnvironment['fetch']>().mockResolvedValue({ok: true, text: async () => JSON.stringify({hash: OLD})});
  const replace = vi.fn((url: string) => { href = url; });
  const env: BuildUpdateEnvironment = {
    fetch, replace, visible: () => visible, href: () => href, windowEvents, documentEvents,
    setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id),
    setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: id => clearInterval(id), now: () => Date.now(),
  };
  const start = () => startBuildUpdates({env, currentHash: OLD, baseUrl: '/tvp-valet/', isBlocked: () => blocked});
  return {env, fetch, replace, start, windowEvents, documentEvents,
    visible(value: boolean) { visible = value; }, blocked(value: boolean) { blocked = value; }, href(value: string) { href = value; }};
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe('deployment update coordinator', () => {
  it('checks startup/focus/visible/every minute, no-store and base-aware', async () => {
    const s = setup(), coordinator = s.start(); await settle();
    expect(s.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = s.fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe('/tvp-valet/version.json');
    expect(new URL(url).searchParams.get('_ts')).toBe(String(Date.now()));
    expect(options.cache).toBe('no-store'); expect(options.signal).toBeInstanceOf(AbortSignal);
    s.windowEvents.dispatchEvent(new Event('focus')); await settle();
    expect(s.fetch).toHaveBeenCalledTimes(2);
    s.visible(false); s.documentEvents.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000); expect(s.fetch).toHaveBeenCalledTimes(2);
    s.visible(true); s.documentEvents.dispatchEvent(new Event('visibilitychange')); await settle();
    expect(s.fetch).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60_000); expect(s.fetch).toHaveBeenCalledTimes(4);
    expect(s.replace).not.toHaveBeenCalled(); coordinator.dispose(); expect(vi.getTimerCount()).toBe(0);
  });
  it('coalesces simultaneous requests and aborts a hanging fetch on timeout', async () => {
    const s = setup(); s.fetch.mockImplementation(() => new Promise(() => {}));
    const coordinator = s.start(); const first = coordinator.check();
    expect(coordinator.check()).toBe(first);
    s.windowEvents.dispatchEvent(new Event('focus')); s.documentEvents.dispatchEvent(new Event('visibilitychange'));
    expect(s.fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000); await first;
    expect(s.fetch.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    void coordinator.check(); expect(s.fetch).toHaveBeenCalledTimes(2);
    coordinator.dispose(); await settle(); expect(vi.getTimerCount()).toBe(0);
  });
  it('defers until explicitly flushed, preserves location and reloads only once', async () => {
    const s = setup(); s.blocked(true);
    s.fetch.mockResolvedValue({ok: true, text: async () => JSON.stringify({hash: NEW})});
    const coordinator = s.start(); await settle(); expect(s.replace).not.toHaveBeenCalled();
    coordinator.flush(); expect(s.replace).not.toHaveBeenCalled();
    s.blocked(false); s.visible(false); coordinator.flush(); expect(s.replace).not.toHaveBeenCalled();
    s.visible(true); coordinator.flush(); coordinator.flush(); await coordinator.check();
    expect(s.replace).toHaveBeenCalledTimes(1);
    const result = new URL(s.replace.mock.calls[0][0]);
    expect(result.pathname).toBe('/tvp-valet/'); expect(result.hash).toBe('#booking-12');
    expect(result.searchParams.get('date')).toBe('2026-10-17'); expect(result.searchParams.get('x')).toBe('1');
    expect(result.searchParams.get('v')).toBe(NEW); coordinator.dispose();
  });
  it('releases queued version on a visible focus or periodic idle recheck', async () => {
    const s = setup(); s.blocked(true);
    s.fetch.mockResolvedValue({ok: true, text: async () => JSON.stringify({hash: NEW})});
    const coordinator = s.start(); await settle(); s.blocked(false);
    await vi.advanceTimersByTimeAsync(60_000); expect(s.replace).toHaveBeenCalledTimes(1); coordinator.dispose();
  });
  it('never loops if destination already carries the same version marker', async () => {
    const s = setup(); s.href(`https://example.com/tvp-valet/?x=1&v=${NEW}#detail`);
    s.fetch.mockResolvedValue({ok: true, text: async () => JSON.stringify({hash: NEW})});
    const coordinator = s.start(); await settle();
    coordinator.flush(); await vi.advanceTimersByTimeAsync(120_000);
    expect(s.replace).not.toHaveBeenCalled(); coordinator.dispose();
  });
  it.each(['null', '[]', '{}', '{"hash":123}', '{"hash":"bad"}', JSON.stringify({hash: NEW.toUpperCase()}), JSON.stringify({hash: NEW, extra: true}), '{', ' '.repeat(4097)])('ignores malformed payload %s', async body => {
    const s = setup(); s.fetch.mockResolvedValue({ok: true, text: async () => body});
    const coordinator = s.start(); await settle(); expect(s.replace).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1); coordinator.dispose();
  });
  it('ignores failures and retries on the next check', async () => {
    const s = setup(); s.fetch.mockRejectedValueOnce(new Error('offline'));
    const coordinator = s.start(); await settle(); expect(s.replace).not.toHaveBeenCalled();
    s.fetch.mockResolvedValueOnce({ok: false, text: async () => { throw Error('must not read'); }});
    await coordinator.check(); expect(s.replace).not.toHaveBeenCalled();
    await coordinator.check(); expect(s.fetch).toHaveBeenCalledTimes(3); coordinator.dispose();
  });
  it('does not apply late response after disposal and removes listeners/timers', async () => {
    const s = setup(); let release!: (response: Pick<Response, 'ok' | 'text'>) => void;
    s.fetch.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const coordinator = s.start(); coordinator.dispose(); coordinator.dispose();
    expect(s.fetch.mock.calls[0][1].signal?.aborted).toBe(true);
    release({ok: true, text: async () => JSON.stringify({hash: NEW})}); await settle();
    s.windowEvents.dispatchEvent(new Event('focus')); s.documentEvents.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(120_000); coordinator.flush(); await coordinator.check();
    expect(s.fetch).toHaveBeenCalledTimes(1); expect(s.replace).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it('discards a queued mismatch if server reports the running build again', async () => {
    const s = setup(); s.blocked(true); s.fetch.mockResolvedValueOnce({ok: true, text: async () => JSON.stringify({hash: NEW})});
    const coordinator = s.start(); await settle(); await coordinator.check(); s.blocked(false); coordinator.flush();
    expect(s.replace).not.toHaveBeenCalled(); coordinator.dispose();
  });
  it('never applies a late timeout response even if fetch ignores abort', async () => {
    const s = setup(); let release!: (response: Pick<Response, 'ok' | 'text'>) => void;
    s.fetch.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const coordinator = s.start(); await vi.advanceTimersByTimeAsync(10_000);
    expect(s.fetch.mock.calls[0][1].signal?.aborted).toBe(true);
    await coordinator.check();
    release({ok: true, text: async () => JSON.stringify({hash: NEW})}); await settle();
    coordinator.flush(); expect(s.replace).not.toHaveBeenCalled(); coordinator.dispose();
  });
  it.each(['malformed', 'failed'])('retains a validated pending version after a %s response', async failure => {
    const s = setup(); s.blocked(true);
    s.fetch.mockResolvedValueOnce({ok: true, text: async () => JSON.stringify({hash: NEW})});
    const coordinator = s.start(); await settle();
    if (failure === 'failed') s.fetch.mockRejectedValueOnce(new Error('offline'));
    else s.fetch.mockResolvedValueOnce({ok: true, text: async () => '{'});
    await coordinator.check(); s.blocked(false); coordinator.flush();
    expect(s.replace).toHaveBeenCalledTimes(1);
    expect(new URL(s.replace.mock.calls[0][0]).searchParams.get('v')).toBe(NEW); coordinator.dispose();
  });
  it('uses the Vite injected hash by default in tests too', async () => {
    const s = setup();
    s.fetch.mockResolvedValue({ok: true, text: async () => JSON.stringify({hash: __BUILD_HASH__})});
    const coordinator = startBuildUpdates({env: s.env, baseUrl: '/tvp-valet/', isBlocked: () => false});
    await settle(); expect(s.replace).not.toHaveBeenCalled(); coordinator.dispose();
  });
  it('does not poll hidden startup, then checks when visible', async () => {
    const s = setup(); s.visible(false); const coordinator = s.start(); await settle(); expect(s.fetch).not.toHaveBeenCalled();
    s.visible(true); s.documentEvents.dispatchEvent(new Event('visibilitychange')); await settle(); expect(s.fetch).toHaveBeenCalledTimes(1); coordinator.dispose();
  });
});
