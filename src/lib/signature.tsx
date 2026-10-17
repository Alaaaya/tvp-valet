import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Maximize2,Trash2,Check} from 'lucide-react';

export const SIG_W=1000,SIG_H=500;
export type Stroke=[number,number][];
function paint(ctx:CanvasRenderingContext2D,strokes:Stroke[],scale:number){
  ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#0d2a26';ctx.lineWidth=Math.max(2,3.2*scale);
  for(const s of strokes){if(!s.length)continue;ctx.beginPath();ctx.moveTo(s[0][0]*scale,s[0][1]*scale);
    if(s.length===1){ctx.lineTo(s[0][0]*scale+.1,s[0][1]*scale)}
    for(let i=1;i<s.length;i++)ctx.lineTo(s[i][0]*scale,s[i][1]*scale);ctx.stroke()}
}
export function renderSignature(strokes:Stroke[]):Promise<Blob>{
  const c=document.createElement('canvas');c.width=SIG_W;c.height=SIG_H;const x=c.getContext('2d')!;x.fillStyle='#fff';x.fillRect(0,0,SIG_W,SIG_H);paint(x,strokes,1);
  return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('Unterschrift konnte nicht erstellt werden.')),'image/png'));
}
function Pad({strokes,onChange,className}:{strokes:Stroke[];onChange:(s:Stroke[])=>void;className?:string}){
  const cv=useRef<HTMLCanvasElement>(null),cur=useRef<Stroke|null>(null),pid=useRef<number|null>(null),live=useRef(strokes);live.current=strokes;
  const redraw=useCallback(()=>{const c=cv.current;if(!c)return;const r=c.getBoundingClientRect();if(!r.width)return;const dpr=window.devicePixelRatio||1;
    const w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(c.width!==w||c.height!==h){c.width=w;c.height=h}
    const x=c.getContext('2d')!;x.clearRect(0,0,w,h);const all=cur.current?[...live.current,cur.current]:live.current;paint(x,all,w/SIG_W)},[]);
  useEffect(()=>{redraw()},[strokes,redraw]);
  useEffect(()=>{const c=cv.current;if(!c)return;const ro=new ResizeObserver(redraw);ro.observe(c);return()=>ro.disconnect()},[redraw]);
  const pt=(e:React.PointerEvent):[number,number]=>{const r=cv.current!.getBoundingClientRect();return[Math.round((e.clientX-r.left)/r.width*SIG_W*10)/10,Math.round((e.clientY-r.top)/r.height*SIG_H*10)/10]};
  return <canvas ref={cv} className={'sig-canvas '+(className||'')} aria-label="Unterschriftenfeld" role="img"
    onPointerDown={e=>{if(pid.current!==null)return;e.preventDefault();pid.current=e.pointerId;try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}cur.current=[pt(e)];redraw()}}
    onPointerMove={e=>{if(e.pointerId!==pid.current||!cur.current)return;e.preventDefault();const evs=(e.nativeEvent as PointerEvent).getCoalescedEvents?.()||[];const list=evs.length?evs:[e.nativeEvent as PointerEvent];const r=cv.current!.getBoundingClientRect();for(const ev of list)cur.current.push([Math.round((ev.clientX-r.left)/r.width*SIG_W*10)/10,Math.round((ev.clientY-r.top)/r.height*SIG_H*10)/10]);redraw()}}
    onPointerUp={e=>{if(e.pointerId!==pid.current)return;const s=cur.current;cur.current=null;pid.current=null;if(s)onChange([...live.current,s])}}
    onPointerCancel={e=>{if(e.pointerId!==pid.current)return;const s=cur.current;cur.current=null;pid.current=null;if(s&&s.length>1)onChange([...live.current,s]);else redraw()}}/>;
}
export function SignatureField({strokes,onChange}:{strokes:Stroke[];onChange:(s:Stroke[])=>void}){
  const[fs,setFs]=useState(false);
  useEffect(()=>{if(!fs)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setFs(false)};window.addEventListener('keydown',k);const o=document.body.style.overflow;return()=>{window.removeEventListener('keydown',k)}},[fs]);
  return <div className="sig">
    <div className="sig-bar"><button type="button" onClick={()=>setFs(true)}><Maximize2 size={15}/> Full screen</button><button type="button" disabled={!strokes.length} onClick={()=>onChange([])}><Trash2 size={15}/> Reset</button></div>
    {!fs&&<Pad strokes={strokes} onChange={onChange}/>}
    {fs&&<div className="sig-full" role="dialog" aria-modal="true" aria-label="Unterschrift Vollbild"><div className="sig-bar"><button type="button" disabled={!strokes.length} onClick={()=>onChange([])}><Trash2 size={15}/> Reset</button><button type="button" className="ok" onClick={()=>setFs(false)}><Check size={15}/> Done</button></div><div className="sig-full-box"><Pad strokes={strokes} onChange={onChange}/></div></div>}
  </div>;
}
