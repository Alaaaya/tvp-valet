import {useEffect,useRef} from 'react';
/** List-only pull-down-to-refresh. Touch gesture at scrollTop 0 opens a solid gap inside the list (padding-top, spinner in ::before),
 *  runs one real refresh, then snaps back. No document bounce: the list uses overscroll-behavior:contain. */
export const PULL={threshold:64,max:96,hold:52,resistance:.5,timeoutMs:20000,slop:8} as const;
export type PullEl={scrollTop:number;style:{setProperty(k:string,v:string):void;removeProperty(k:string):void};dataset:Record<string,string|undefined>;
 addEventListener(t:string,f:(e:any)=>void,o?:any):void;removeEventListener(t:string,f:(e:any)=>void,o?:any):void;contains?(n:any):boolean};
export const pullGap=(dy:number)=>Math.max(0,Math.min(PULL.max,dy*PULL.resistance));
const FORM=/^(INPUT|TEXTAREA|SELECT|VIDEO|CANVAS)$/;
export class RefreshAbort extends Error{constructor(){super('Aktualisierung abgebrochen')}}
/** Rejects with RefreshAbort once the signal fires, so a hung request can never keep the gap open. */
export function abortable<T>(p:Promise<T>,s:AbortSignal):Promise<T>{
 return new Promise<T>((res,rej)=>{if(s.aborted)return rej(new RefreshAbort());const f=()=>rej(new RefreshAbort());s.addEventListener('abort',f,{once:true});
  p.then(v=>{s.removeEventListener('abort',f);res(v)},e=>{s.removeEventListener('abort',f);rej(e)})});
}
/** Single in-flight runner: ignores triggers while busy, aborts on timeout/dispose, always settles. */
export function createRefreshRunner(task:(s:AbortSignal)=>Promise<unknown>,o:{timeoutMs?:number;onError?:(e:unknown)=>void}={}){
 let ctl:AbortController|null=null,disposed=false;
 return{
  get busy(){return !!ctl},
  async run():Promise<boolean>{
   if(ctl)return false;const c=ctl=new AbortController();const t=setTimeout(()=>c.abort(),o.timeoutMs??PULL.timeoutMs);
   try{await abortable(task(c.signal),c.signal);return true}
   catch(e){if(!(e instanceof RefreshAbort&&c.signal.aborted&&disposed))o.onError?.(e);return false}
   finally{clearTimeout(t);if(ctl===c)ctl=null}
  },
  dispose(){disposed=true;ctl?.abort()}
 };
}
/** Attach gesture handling to the list. Returns cleanup. */
export function attachPullRefresh(el:PullEl,runner:{run():Promise<boolean>;readonly busy:boolean}){
 let y0=0,x0=0,pull=0,track=false,active=false,gone=false;
 const setGap=(px:number,animate:boolean)=>{el.dataset.pull=animate?'settle':px>0?'drag':'';if(px>0||animate)el.style.setProperty('--pull-gap',px+'px');else el.style.removeProperty('--pull-gap')};
 const reset=()=>{track=false;active=false;pull=0;if(!runner.busy){setGap(0,true);el.dataset.pull=''; el.style.removeProperty('--pull-gap')}};
 const start=(e:any)=>{track=false;active=false;pull=0;if(runner.busy||e.touches?.length!==1||el.scrollTop>0)return;const t=e.touches[0];if(e.target&&FORM.test(String(e.target.tagName||'')))return;y0=t.clientY;x0=t.clientX;track=true};
 const move=(e:any)=>{if(!track)return;if(e.touches?.length!==1||runner.busy){reset();return}const t=e.touches[0],dy=t.clientY-y0,dx=t.clientX-x0;
  if(!active){if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>PULL.slop||dy<-PULL.slop||el.scrollTop>0){track=false;return}if(dy<PULL.slop)return;active=true;y0=t.clientY-dy+PULL.slop;}
  const d=t.clientY-y0;if(d<=0){pull=0;setGap(0,false);return}if(el.scrollTop>0){reset();return}
  pull=pullGap(d);if(e.cancelable)e.preventDefault();el.dataset.pull='drag';el.style.setProperty('--pull-gap',pull+'px')};
 const end=async()=>{const fire=active&&pull>=PULL.threshold;const was=active;track=false;active=false;if(!was){return}
  if(!fire||runner.busy){pull=0;setGap(0,true);return}
  pull=0;el.dataset.pull='busy';el.style.setProperty('--pull-gap',PULL.hold+'px');
  try{await runner.run()}finally{if(!gone){el.dataset.pull='settle';el.style.setProperty('--pull-gap','0px');setTimeout(()=>{if(!gone&&el.dataset.pull==='settle'&&!runner.busy){el.dataset.pull='';el.style.removeProperty('--pull-gap')}},260)}}};
 const cancel=()=>{if(runner.busy)return;reset()};
 el.addEventListener('touchstart',start,{passive:true});el.addEventListener('touchmove',move,{passive:false});el.addEventListener('touchend',end);el.addEventListener('touchcancel',cancel);
 return()=>{gone=true;el.removeEventListener('touchstart',start);el.removeEventListener('touchmove',move);el.removeEventListener('touchend',end);el.removeEventListener('touchcancel',cancel);el.style.removeProperty('--pull-gap');el.dataset.pull=''};
}
/** Hook: always calls the latest task; runner persists across renders; aborts on unmount. */
export function usePullRefresh(listRef:{current:PullEl|null},task:(s:AbortSignal)=>Promise<unknown>,onError:(e:unknown)=>void,enabled=true){
 const t=useRef(task),er=useRef(onError);t.current=task;er.current=onError;
 useEffect(()=>{const el=listRef.current;if(!el||!enabled)return;const runner=createRefreshRunner(s=>t.current(s),{onError:e=>er.current(e)});const off=attachPullRefresh(el,runner);return()=>{off();runner.dispose()}},[enabled]);
}
