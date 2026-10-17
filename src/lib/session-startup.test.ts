import {describe,it,expect,vi,afterEach} from 'vitest';
import {observeSession,type StoredSession} from './session-startup';
const session={user:{id:'admin'},access_token:'persisted'};
function setup(getSession=vi.fn(async()=>({data:{session},error:null}))){
  const win=new EventTarget(),doc=Object.assign(new EventTarget(),{visibilityState:'visible' as DocumentVisibilityState});
  let callback:(event:string,s:StoredSession|null)=>void=()=>{};
  const unsubscribe=vi.fn();const auth={getSession,onAuthStateChange:vi.fn((fn:typeof callback)=>{callback=fn;return{data:{subscription:{unsubscribe}}}})};
  const change=vi.fn(),error=vi.fn();
  const off=observeSession(auth,change,error,win,doc);
  return{win,doc,auth,change,error,off,unsubscribe,event:(e:string,s:StoredSession|null)=>callback(e,s)};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve()};
afterEach(()=>vi.useRealTimers());
describe('persisted startup',()=>{
  it('restores existing session without password or clearing storage',async()=>{const s=setup();await flush();expect(s.change).toHaveBeenCalledWith(session);expect(s.error).not.toHaveBeenCalled();s.off()});
  it('authoritative empty storage shows login',async()=>{const s=setup(vi.fn(async()=>({data:{session:null as any},error:null})));await flush();expect(s.change).toHaveBeenCalledWith(null);s.off()});
  it('transient error does not emit a logout and retries',async()=>{vi.useFakeTimers();const get=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({data:{session},error:null});const s=setup(get);await flush();expect(s.change).not.toHaveBeenCalled();expect(s.error).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(1000);expect(s.change).toHaveBeenCalledWith(session);s.off()});
  it('later auth event wins over a stale startup snapshot',async()=>{vi.useFakeTimers();let resolve:any;const s=setup(vi.fn(()=>new Promise(r=>{resolve=r})));s.event('SIGNED_IN',session);resolve({data:{session:null},error:null});await flush();await vi.runOnlyPendingTimersAsync();expect(s.change).toHaveBeenCalledExactlyOnceWith(session);s.off()});
  it('defers event handlers outside SDK callback locks',async()=>{vi.useFakeTimers();const s=setup();await flush();s.change.mockClear();s.event('TOKEN_REFRESHED',{...session,access_token:'new'});expect(s.change).not.toHaveBeenCalled();await vi.runOnlyPendingTimersAsync();expect(s.change).toHaveBeenCalledOnce();s.off()});
  it('ignores non-authoritative null refresh events',async()=>{vi.useFakeTimers();const s=setup();await flush();s.event('TOKEN_REFRESHED',null);await vi.runOnlyPendingTimersAsync();expect(s.change).toHaveBeenCalledExactlyOnceWith(session);s.off()});
  it('signout is honored and stale reads cannot restore it',async()=>{vi.useFakeTimers();const s=setup();await flush();s.event('SIGNED_OUT',null);await vi.runOnlyPendingTimersAsync();expect(s.change).toHaveBeenLastCalledWith(null);s.off()});
  it('pageshow, visibility and online re-read stored auth without forced logout',async()=>{const s=setup();await flush();for(const e of ['pageshow','online','focus']){s.win.dispatchEvent(new Event(e));await flush()}s.doc.dispatchEvent(new Event('visibilitychange'));await flush();expect(s.auth.getSession).toHaveBeenCalledTimes(5);expect(s.change).toHaveBeenCalledOnce();s.off()});
  it('cleans subscriptions, pending callbacks and retries',async()=>{vi.useFakeTimers();const s=setup();await flush();s.event('SIGNED_OUT',null);s.off();await vi.runOnlyPendingTimersAsync();s.win.dispatchEvent(new Event('focus'));expect(s.unsubscribe).toHaveBeenCalledOnce();expect(s.change).toHaveBeenCalledExactlyOnceWith(session)});
});
