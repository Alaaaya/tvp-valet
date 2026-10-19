import React,{useEffect,useRef,useState} from 'react';
import SignaturePad,{type PointGroup} from 'signature_pad';
import {Maximize2,Trash2,Check} from 'lucide-react';

export const SIG_W=1000,SIG_H=500;
export type Stroke=PointGroup;
const PEN={minWidth:1.2,maxWidth:3.4,penColor:'#0d2a26'};
const scaleGroups=(g:PointGroup[],k:number):PointGroup[]=>g.map(s=>({...s,points:s.points.map(p=>({...p,x:p.x*k,y:p.y*k}))}));
export async function renderSignature(groups:PointGroup[]):Promise<Blob>{
  const c=document.createElement('canvas');c.width=SIG_W;c.height=SIG_H;
  const p=new SignaturePad(c,{backgroundColor:'#fff',minWidth:PEN.minWidth*SIG_W/360,maxWidth:PEN.maxWidth*SIG_W/360,penColor:PEN.penColor});p.fromData(groups);
  const url=p.toDataURL('image/png');p.off();
  const b=await (await fetch(url)).blob();if(!b.size)throw Error('Unterschrift konnte nicht erstellt werden.');return b;
}
// groups are stored in a logical SIG_W x SIG_H space; the visible canvas scales uniformly (2:1)
function Pad({groups,onChange}:{groups:PointGroup[];onChange:(g:PointGroup[])=>void}){
  const cv=useRef<HTMLCanvasElement>(null),pad=useRef<SignaturePad|null>(null),live=useRef(groups),cb=useRef(onChange);live.current=groups;cb.current=onChange;
  useEffect(()=>{
    const c=cv.current!;const sp=new SignaturePad(c,{...PEN,throttle:8});pad.current=sp;
    const fit=()=>{const w=c.offsetWidth,h=c.offsetHeight;if(!w||!h)return;const r=Math.max(window.devicePixelRatio||1,1);
      const cw=Math.round(w*r),ch=Math.round(h*r);if(c.width!==cw||c.height!==ch){c.width=cw;c.height=ch;c.getContext('2d')!.scale(r,r)}
      sp.minWidth=PEN.minWidth*w/360;sp.maxWidth=PEN.maxWidth*w/360;sp.clear();sp.fromData(scaleGroups(live.current,w/SIG_W))};
    fit();const ro=new ResizeObserver(fit);ro.observe(c);
    sp.addEventListener('endStroke',()=>{const w=c.offsetWidth||SIG_W;cb.current(scaleGroups(sp.toData(),SIG_W/w))});
    return()=>{ro.disconnect();sp.off();pad.current=null};
  },[]);
  useEffect(()=>{const c=cv.current,sp=pad.current;if(!c||!sp||!c.offsetWidth)return;if(!groups.length&&!sp.isEmpty()){sp.clear()}},[groups]);
  return <canvas ref={cv} className="sig-canvas" aria-label="Unterschriftenfeld" role="img"/>;
}
export function SignatureField({strokes,onChange}:{strokes:PointGroup[];onChange:(s:PointGroup[])=>void}){
  const[fs,setFs]=useState(false);
  useEffect(()=>{if(!fs)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape')setFs(false)};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[fs]);
  return <div className="sig">
    <div className="sig-bar"><button type="button" onClick={()=>setFs(true)}><Maximize2 size={15}/> Full screen</button><button type="button" disabled={!strokes.length} onClick={()=>onChange([])}><Trash2 size={15}/> Reset</button></div>
    {!fs&&<Pad groups={strokes} onChange={onChange}/>}
    {fs&&<div className="sig-full" role="dialog" aria-modal="true" aria-label="Unterschrift Vollbild"><div className="sig-bar"><button type="button" disabled={!strokes.length} onClick={()=>onChange([])}><Trash2 size={15}/> Reset</button><button type="button" className="ok" onClick={()=>setFs(false)}><Check size={15}/> Done</button></div><div className="sig-full-box"><Pad groups={strokes} onChange={onChange}/></div></div>}
  </div>;
}
