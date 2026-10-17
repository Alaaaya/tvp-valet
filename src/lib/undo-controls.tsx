import React,{useEffect,useRef,useState} from 'react';
import {Undo2} from 'lucide-react';
import type {Booking} from '../model';
import {undoHandover,canUndoHandover} from './handover-undo';

type Act='in'|'out';
const NAME:Record<Act,string>={in:'Check-in',out:'Check-out'};

export function UndoControls({booking,onDone}:{booking:Booking;onDone:(b:Booking)=>void}){
  const[ask,setAsk]=useState<Act|null>(null),[busy,setBusy]=useState(false),[err,setErr]=useState('');
  const ids=useRef<Record<string,string>>({}),saving=useRef(false),alive=useRef(true),cancel=useRef<HTMLButtonElement>(null),opener=useRef<HTMLElement|null>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  useEffect(()=>{if(ask)cancel.current?.focus()},[ask]);
  const close=()=>{if(busy)return;setAsk(null);setErr('');opener.current?.focus()};
  useEffect(()=>{if(!ask)return;const k=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!saving.current){setAsk(null);setErr('')}};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[ask]);
  const acts=(['out','in'] as Act[]).filter(a=>canUndoHandover(booking,a));
  // check-out has to be undone first when both exist
  const shown=acts.includes('out')?acts.filter(a=>a==='out'):acts;
  if(!shown.length&&!ask)return null;
  async function go(){
    if(!ask||saving.current)return;saving.current=true;setBusy(true);setErr('');
    const key=booking.id+':'+ask;ids.current[key]=ids.current[key]||crypto.randomUUID();
    try{const nb=await undoHandover({requestId:ids.current[key],booking,action:ask});delete ids.current[key];if(alive.current){setAsk(null);onDone(nb)}}
    catch(e){if(alive.current)setErr((e instanceof Error?e.message:String(e))+' Bitte erneut versuchen.')}
    finally{saving.current=false;if(alive.current)setBusy(false)}
  }
  return <section className="undo" aria-label="Übergabe rückgängig">
    {shown.map(a=><button key={a} type="button" className="undo-btn" onClick={e=>{opener.current=e.currentTarget;setErr('');setAsk(a)}}><Undo2 size={18}/> {NAME[a]} rückgängig</button>)}
    {ask&&<div className="undo-scrim" onClick={close}><div className="undo-dlg" role="alertdialog" aria-modal="true" aria-labelledby="undo-t" aria-describedby="undo-d" onClick={e=>e.stopPropagation()}>
      <h3 id="undo-t">{NAME[ask]} rückgängig machen?</h3>
      <p id="undo-d">Die Buchung wird wieder auf offen gesetzt. Fotos und Unterschriften bleiben erhalten und werden als „Rückgängig gemacht“ markiert.{ask==='in'&&booking.checked_out_at?' Der Check-out muss zuerst rückgängig gemacht werden.':''}</p>
      {err&&<div className="undo-err" role="alert">{err}</div>}
      <button ref={cancel} type="button" className="undo-cancel" disabled={busy} onClick={close}>Abbrechen</button>
      <button type="button" className="undo-ok" disabled={busy} aria-busy={busy} onClick={go}>{busy?'Wird rückgängig gemacht …':err?'Erneut versuchen':NAME[ask]+' rückgängig'}</button>
    </div></div>}
  </section>;
}
