import React,{useEffect,useRef,useState} from 'react';
import {Undo2} from 'lucide-react';
import type {Booking} from '../model';
import {undoHandover,canUndoHandover} from './handover-undo';

type Act='in'|'out';
const NAME:Record<Act,string>={in:'Check-in',out:'Check-out'};
export const expectedAt=(b:Booking,a:Act)=>(a==='in'?b.checked_in_at:b.checked_out_at)||'';
export const undoRequestKey=(b:Booking,a:Act)=>b.id+':'+a+':'+expectedAt(b,a);
export function undoCopy(a:Act,b:Booking){
  const kept='Fotos und Unterschriften bleiben erhalten und werden als „Rückgängig gemacht“ markiert.';
  return a==='out'?'Der Check-out wird zurückgenommen. Das Fahrzeug gilt danach wieder als eingecheckt und steht zur Rückgabe an. '+kept
    :'Der Check-in wird zurückgenommen. Das Fahrzeug gilt danach wieder als erwartet und noch nicht angenommen. '+kept;
}
export function trapTab(i:number,n:number,shift:boolean){return n<1?-1:shift?(i<=0?n-1:i-1):(i>=n-1?0:i+1)}

export function UndoControls({booking,onDone}:{booking:Booking;onDone:(b:Booking)=>void}){
  const[snap,setSnap]=useState<{a:Act;b:Booking}|null>(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
  const dlg=useRef<HTMLDivElement>(null),ids=useRef<Record<string,string>>({}),saving=useRef(false),alive=useRef(true),cancel=useRef<HTMLButtonElement>(null),opener=useRef<HTMLElement|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  const ask=snap?.a||null;
  useEffect(()=>{if(ask)cancel.current?.focus()},[ask]);
  const close=()=>{if(saving.current)return;setSnap(null);setErr('');const o=opener.current;setTimeout(()=>o?.focus(),0)};
  const keys=(e:React.KeyboardEvent)=>{
    if(e.key==='Escape'){e.stopPropagation();close();return}
    if(e.key!=='Tab')return;
    const f=Array.from(dlg.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')||[]);
    if(!f.length){e.preventDefault();dlg.current?.focus();return}
    const i=f.indexOf(document.activeElement as HTMLElement);e.preventDefault();f[trapTab(i,f.length,e.shiftKey)].focus();
  };
  const acts=(['out','in'] as Act[]).filter(a=>canUndoHandover(booking,a));
  // check-out has to be undone first when both exist
  const shown=acts.includes('out')?acts.filter(a=>a==='out'):acts;
  if(!shown.length&&!snap)return null;
  async function go(){
    if(!snap||saving.current)return;saving.current=true;setBusy(true);setErr('');
    const key=undoRequestKey(snap.b,snap.a);ids.current[key]=ids.current[key]||crypto.randomUUID();
    try{const nb=await undoHandover({requestId:ids.current[key],booking:snap.b,action:snap.a});delete ids.current[key];if(alive.current){setSnap(null);onDone(nb)}}
    catch(e){if(alive.current)setErr((e instanceof Error?e.message:String(e))+' Bitte erneut versuchen.')}
    finally{saving.current=false;if(alive.current)setBusy(false)}
  }
  return <section className="undo" aria-label="Übergabe rückgängig">
    {shown.map(a=><button key={a} type="button" className="undo-btn" onClick={e=>{opener.current=e.currentTarget;setErr('');setSnap({a,b:{...booking}})}}><Undo2 size={18}/> {NAME[a]} rückgängig</button>)}
    {ask&&<div className="undo-scrim" onClick={close}><div ref={dlg} tabIndex={-1} onKeyDown={keys} className="undo-dlg" role="alertdialog" aria-modal="true" aria-labelledby="undo-t" aria-describedby="undo-d" onClick={e=>e.stopPropagation()}>
      <h3 id="undo-t">{NAME[ask]} rückgängig machen?</h3>
      <p id="undo-d">{undoCopy(ask,snap!.b)}</p>
      {err&&<div className="undo-err" role="alert">{err}</div>}
      <button ref={cancel} type="button" className="undo-cancel" disabled={busy} onClick={close}>Abbrechen</button>
      <button type="button" className="undo-ok" disabled={busy} aria-busy={busy} onClick={go}>{busy?'Wird rückgängig gemacht …':err?'Erneut versuchen':NAME[ask]+' rückgängig'}</button>
    </div></div>}
  </section>;
}
