import {describe,expect,it,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {PULL,pullGap,attachPullRefresh,createRefreshRunner,abortable,RefreshAbort,type PullEl} from './pull-refresh';
import {fetchFlightUpdates} from './flights';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()});
function el(scrollTop=0){const h:Record<string,((e:any)=>void)[]>={};const st:Record<string,string>={};
 const e:any={scrollTop,dataset:{} as Record<string,string|undefined>,style:{setProperty:(k:string,v:string)=>{st[k]=v},removeProperty:(k:string)=>{delete st[k]}},
  addEventListener:(t:string,f:any)=>{(h[t]=h[t]||[]).push(f)},removeEventListener:(t:string,f:any)=>{h[t]=(h[t]||[]).filter(x=>x!==f)},
  fire:(t:string,ev:any={})=>{const o={cancelable:true,defaultPrevented:false,preventDefault(){o.defaultPrevented=true},...ev};(h[t]||[]).forEach(f=>f(o));return o},st,h};return e}
const T=(y:number,x=0)=>({touches:[{clientY:y,clientX:x}]});
const drag=(e:any,ys:number[])=>{e.fire('touchstart',T(ys[0]));return ys.slice(1).map(y=>e.fire('touchmove',T(y)))};
describe('gap math',()=>{it('resists and caps',()=>{expect(pullGap(-5)).toBe(0);expect(pullGap(40)).toBe(20);expect(pullGap(10000)).toBe(PULL.max)})});
describe('gesture',()=>{
 it('below threshold snaps back without refresh',()=>{const e=el(),run=vi.fn(async()=>true);attachPullRefresh(e,{run,busy:false});drag(e,[100,150]);expect(e.st['--pull-gap']).toBe('21px');e.fire('touchend');expect(run).not.toHaveBeenCalled();expect(e.st['--pull-gap']).toBe('0px')});
 it('past threshold runs once, holds gap, collapses after',async()=>{vi.useFakeTimers();const e=el();let done:()=>void=()=>{};const run=vi.fn(()=>new Promise<boolean>(r=>{done=()=>r(true)}));attachPullRefresh(e,{run,get busy(){return false}} as any);
  const evs=drag(e,[100,150,260]);expect(evs[1].defaultPrevented).toBe(true);e.fire('touchend');expect(run).toHaveBeenCalledTimes(1);expect(e.dataset.pull).toBe('busy');expect(e.st['--pull-gap']).toBe(PULL.hold+'px');
  done();await vi.advanceTimersByTimeAsync(300);expect(e.dataset.pull).toBe('');expect(e.st['--pull-gap']).toBeUndefined()});
 it('does not hijack normal scroll, horizontal, scrolled list, forms, multi-touch',()=>{const run=vi.fn(async()=>true);
  const a=el(20);attachPullRefresh(a,{run,busy:false});expect(drag(a,[100,300])[0].defaultPrevented).toBe(false);
  const b=el();attachPullRefresh(b,{run,busy:false});expect(drag(b,[300,100,50])[0].defaultPrevented).toBe(false);
  const c=el();attachPullRefresh(c,{run,busy:false});c.fire('touchstart',T(100,0));expect(c.fire('touchmove',T(110,80)).defaultPrevented).toBe(false);expect(c.fire('touchmove',T(300,80)).defaultPrevented).toBe(false);
  const d=el();attachPullRefresh(d,{run,busy:false});d.fire('touchstart',{...T(100),target:{tagName:'INPUT'}});expect(d.fire('touchmove',T(300)).defaultPrevented).toBe(false);
  const f=el();attachPullRefresh(f,{run,busy:false});f.fire('touchstart',{touches:[{clientY:1,clientX:0},{clientY:2,clientX:0}]});expect(f.fire('touchmove',T(300)).defaultPrevented).toBe(false);
  for(const x of [a,b,c,d,f])x.fire('touchend');expect(run).not.toHaveBeenCalled()});
 it('cleanup removes listeners',()=>{const e=el(),off=attachPullRefresh(e,{run:async()=>true,busy:false});off();expect(Object.values(e.h).every((l:any)=>l.length===0)).toBe(true)});
});
describe('runner',()=>{
 it('single in-flight, error cleanup, reusable',async()=>{const onError=vi.fn();let n=0;const r=createRefreshRunner(async()=>{n++;if(n===1)throw new Error('x')},{onError});const p=r.run();expect(r.busy).toBe(true);expect(await r.run()).toBe(false);expect(await p).toBe(false);expect(onError).toHaveBeenCalledTimes(1);expect(r.busy).toBe(false);expect(await r.run()).toBe(true)});
 it('timeout aborts a hung task and frees the gap',async()=>{vi.useFakeTimers();const onError=vi.fn();let sig!:AbortSignal;const r=createRefreshRunner(s=>{sig=s;return new Promise(()=>{})},{timeoutMs:1000,onError});const p=r.run();await vi.advanceTimersByTimeAsync(1001);expect(await p).toBe(false);expect(sig.aborted).toBe(true);expect(onError.mock.calls[0][0]).toBeInstanceOf(RefreshAbort);expect(r.busy).toBe(false)});
 it('dispose aborts silently; stale result ignored',async()=>{const onError=vi.fn();let sig!:AbortSignal;const r=createRefreshRunner(s=>{sig=s;return new Promise(()=>{})},{onError});const p=r.run();r.dispose();expect(await p).toBe(false);expect(sig.aborted).toBe(true);expect(onError).not.toHaveBeenCalled();
  const c=new AbortController();const late=new Promise<number>(r=>setTimeout(()=>r(1),5));const q=abortable(late,c.signal);c.abort();await expect(q).rejects.toBeInstanceOf(RefreshAbort)});
});
describe('real refetch',()=>{
 it('flight lookup hits the network uncached and honors abort',async()=>{const calls:any[]=[];vi.stubGlobal('fetch',vi.fn((u:string,o:any)=>{calls.push([u,o]);return new Promise((_,rej)=>o.signal?.addEventListener('abort',()=>rej(new DOMException('a','AbortError'))))}));
  const c=new AbortController();const p=fetchFlightUpdates(['LH123'],'2026-10-17','arrival',c.signal).catch(e=>e);await Promise.resolve();c.abort();const e=await p;if(calls.length){expect(calls[0][1].cache).toBe('no-store');expect(calls[0][1].signal).toBe(c.signal);expect(e.name).toBe('AbortError')}else expect(e).toBeInstanceOf(Error)});
 it('main wires one pull task that refetches bookings and flights, list-only',()=>{const s=readFileSync('src/main.tsx','utf8');expect(s).toMatch(/pullTask=async\(signal[^]*?Promise\.all\(\[refresh\(signal\),loadFlightDays\(/);expect(s).toContain('usePullRefresh(listRef,pullTask');expect(s).toContain('void refreshList()');expect(s).toContain('gen!==flightGeneration.current');expect(s).toContain('key!==contextRef.current');expect(s).toContain('if(!valid())return');expect(s).toContain("view==='today'&&session");expect(s).toContain('aria-label="Aktualisieren"');
  const css=readFileSync('src/pull-refresh.css','utf8');expect(css).toContain('padding-top:var(--pull-gap');expect(css).not.toMatch(/blur|backdrop/);expect(readFileSync('src/main-list.css','utf8')).toContain('overscroll-behavior:contain')});
});

describe('coordinator lifecycle races',()=>{
 it('never starts another request after unmount',async()=>{const task=vi.fn(async()=>{});const r=createRefreshRunner(task);r.dispose();expect(await r.run()).toBe(false);expect(task).not.toHaveBeenCalled()});
 it('context cancellation stops late apply and allows new date request',async()=>{let release!:()=>void;const applied:string[]=[];let date='old';
 const r=createRefreshRunner(async s=>{const snapshot=date;await new Promise<void>(res=>{release=res});if(!s.aborted&&snapshot===date)applied.push(snapshot)});
 const first=r.run();date='new';r.cancel();expect(await first).toBe(false);release();await Promise.resolve();expect(applied).toEqual([]);
 const second=r.run();release();expect(await second).toBe(true);expect(applied).toEqual(['new'])});
 it('timeout then late response cannot mutate and collapses gesture gap',async()=>{vi.useFakeTimers();let release!:()=>void;const applied=vi.fn();const e=el();
 const r=createRefreshRunner(async s=>{await new Promise<void>(res=>{release=res});if(!s.aborted)applied()},{timeoutMs:20});
 const off=attachPullRefresh(e,r);drag(e,[0,160]);e.fire('touchend');expect(e.dataset.pull).toBe('busy');await vi.advanceTimersByTimeAsync(25);expect(e.st['--pull-gap']).toBe('0px');release();await vi.advanceTimersByTimeAsync(300);expect(applied).not.toHaveBeenCalled();expect(e.st['--pull-gap']).toBeUndefined();off()});
 it('unmount while gesture request hangs removes gap and aborts without later apply',async()=>{const e=el();let release!:()=>void;const apply=vi.fn();const r=createRefreshRunner(async s=>{await new Promise<void>(res=>release=res);if(!s.aborted)apply()});const off=attachPullRefresh(e,r);drag(e,[0,160]);e.fire('touchend');off();r.dispose();release();await Promise.resolve();expect(e.st['--pull-gap']).toBeUndefined();expect(apply).not.toHaveBeenCalled()});
 it('manual and gesture invoke the identical single-flight runner',async()=>{let release!:()=>void;const task=vi.fn(()=>new Promise<void>(res=>release=res));const r=createRefreshRunner(task),e=el();attachPullRefresh(e,r);const manual=r.run();drag(e,[0,160]);e.fire('touchend');expect(task).toHaveBeenCalledTimes(1);release();expect(await manual).toBe(true)});
});
