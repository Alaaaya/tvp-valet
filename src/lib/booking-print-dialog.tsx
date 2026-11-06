import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {day,type Booking} from '../model';
import {t as tr} from './i18n';
import {deliverPdf} from './print-sheets-button';
import {useEdgeBackBlock} from './use-edge-back';

/** Prints exactly one booking. Same dialog styles and generators as the day Druckauswahl; no query or mutation. */
export function BookingPrintDialog({booking,onClose}:{booking:Booking;onClose:()=>void}){
 const[format,setFormat]=useState<'normal'|'short'>('normal');
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState<File|null>(null);
 const identity=JSON.stringify([format,booking]),current=useRef(identity),alive=useRef(true),locked=useRef(false),closed=useRef(false);
 const root=useRef<HTMLElement>(null);
 current.current=identity;
 useEdgeBackBlock(true,100);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{setReady(null);setError('')},[identity]);
 useLayoutEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  root.current?.focus();
  return()=>{previous?.isConnected&&previous.focus()};
 },[]);
 const close=()=>{closed.current=true;onClose()};
 const print=async()=>{
  if(locked.current)return;
  locked.current=true;setBusy(true);setError('');
  const selection=identity,items=[{b:booking}],date=day(booking.arrival_at);
  const fresh=()=>alive.current&&!closed.current&&current.current===selection;
  try{
   let file=ready;
   if(!file){
    const generate=format==='short'?(await import('./print-short')).shortPdfFile:(await import('./print-sheets')).sheetsPdfFile;
    if(!fresh())return;file=await generate(items,date);
   }
   if(!fresh())return;
   const outcome=await deliverPdf(file);
   if(!fresh())return;
   if(outcome==='needs-tap')setReady(file);else close();
  }catch(e){if(fresh())setError(tr("PDF konnte nicht erstellt werden")+(e instanceof Error?': '+e.message:''))}
  finally{locked.current=false;if(alive.current)setBusy(false)}
 };
 return createPortal(<div className="day-print-backdrop" onClick={e=>{if(e.target===e.currentTarget)close()}}>
  <section ref={root} tabIndex={-1} className="day-print-dialog" role="dialog" aria-modal="true" aria-labelledby="day-print-title" onKeyDown={e=>{
   if(e.key==='Escape'){e.stopPropagation();close()}
   if(e.key==='Tab'){
    const els=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')||[]);
    const first=els[0],last=els[els.length-1];
    if(e.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){e.preventDefault();last?.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
   }
  }}>
   <h2 id="day-print-title">{tr("Druckauswahl")}</h2>
   <fieldset disabled={busy} className="day-print-types day-print-formats"><legend>{tr("Druckformat")}</legend>
    {(['normal','short'] as const).map(k=><label key={k}><input type="radio" name="print-format" value={k} checked={format===k} onChange={()=>setFormat(k)}/>{k==='normal'?tr("Normal"):tr("Kurz")}</label>)}
   </fieldset>
   {error&&<p className="error" role="alert">{error}</p>}
   <div className="day-print-actions"><button onClick={close}>{tr("Abbrechen")}</button><button className="primary" aria-busy={busy} disabled={busy} onClick={()=>void print()}>{busy?tr("PDF wird erstellt …"):ready?tr("PDF öffnen"):tr("Drucken")}</button></div>
  </section>
 </div>,document.body);
}
