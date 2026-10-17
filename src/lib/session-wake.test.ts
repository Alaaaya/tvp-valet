import {describe,expect,it,vi} from 'vitest';
import {installSessionWake} from './session-wake';

function setup(state='visible',recover:any=vi.fn(()=>Promise.resolve('t'))){
  const doc:any=new EventTarget();doc.visibilityState=state;
  const win=new EventTarget();const wake=vi.fn();
  const off=installSessionWake(doc,win,recover,wake);
  return {doc,win,wake,recover,off};
}
const flush=()=>new Promise(r=>setTimeout(r,0));

describe('installSessionWake',()=>{
  it('focus when visible recovers once then wakes after settle',async()=>{
    const {win,wake,recover}=setup();
    win.dispatchEvent(new Event('focus'));
    expect(wake).not.toHaveBeenCalled();
    await flush();
    expect(recover).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenCalledTimes(1);
  });
  it('hidden does nothing',async()=>{
    const {win,doc,wake,recover}=setup('hidden');
    win.dispatchEvent(new Event('focus'));doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(recover).not.toHaveBeenCalled();expect(wake).not.toHaveBeenCalled();
  });
  it('visibilitychange to visible recovers',async()=>{
    const {doc,wake,recover}=setup('hidden');
    doc.visibilityState='visible';doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(recover).toHaveBeenCalledTimes(1);expect(wake).toHaveBeenCalledTimes(1);
  });
  it('rejection still wakes',async()=>{
    const {win,wake}=setup('visible',vi.fn(()=>Promise.reject(new Error('x'))));
    win.dispatchEvent(new Event('online'));
    await flush();
    expect(wake).toHaveBeenCalledTimes(1);
  });
  it('synchronous throw still wakes',async()=>{
    const {win,wake}=setup('visible',vi.fn(()=>{throw new Error('x')}));
    win.dispatchEvent(new Event('focus'));
    await flush();
    expect(wake).toHaveBeenCalledTimes(1);
  });
  it('no recover wakes directly',()=>{
    const doc:any=new EventTarget();doc.visibilityState='visible';const win=new EventTarget();const wake=vi.fn();
    installSessionWake(doc,win,null,wake);win.dispatchEvent(new Event('focus'));
    expect(wake).toHaveBeenCalledTimes(1);
  });
  it('cleanup removes listeners',async()=>{
    const {win,doc,wake,recover,off}=setup();
    off();
    win.dispatchEvent(new Event('focus'));win.dispatchEvent(new Event('online'));doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(recover).not.toHaveBeenCalled();expect(wake).not.toHaveBeenCalled();
  });
});
