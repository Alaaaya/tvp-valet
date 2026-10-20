import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Booking} from '../model';
import {t as tr} from './i18n';
import {validDay} from './date-persist';
import {bookingsForPrintDay,printToday,type PrintDirection} from './print-sheets-data';
import {deliverPdf} from './print-sheets-button';
import {useEdgeBackBlock} from './use-edge-back';

/** No query or mutation: count and PDF share the exact same scheduled-date snapshot. */
export function DayPrintDialog({rows,loading=false,loadError='',onClose}:{rows:readonly Booking[];loading?:boolean;loadError?:string;onClose:()=>void}){
 const[date,setDate]=useState(()=>printToday()),[direction,setDirection]=useState<PrintDirection>('in');
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState<File|null>(null);
 const valid=validDay(date),items=useMemo(()=>bookingsForPrintDay(rows,date,direction),[rows,date,direction]);
 const identity=JSON.stringify([date,direction,items,loading,loadError]),current=useRef(identity),alive=useRef(true),locked=useRef(false);
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
 const close=()=>{if(!locked.current)onClose()};
 const print=async()=>{
  if(locked.current||loading||loadError||error||!valid||!items.length)return;
  locked.current=true;setBusy(true);setError('');
  const selection=identity,snapshot=items;
  const fresh=()=>alive.current&&current.current===selection;
  try{
   let file=ready;
   if(!file){const m=await import('./print-sheets');if(!fresh())return;file=await m.sheetsPdfFile(snapshot,date)}
   if(!fresh())return;
   const outcome=await deliverPdf(file);
   if(!fresh())return;
   if(outcome==='needs-tap')setReady(file);else onClose();
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
   <fieldset disabled={busy||loading} className="day-print-types"><legend>{tr("Druckauswahl")}</legend>
    {(['in','out'] as const).map(k=><label key={k}><input type="radio" name="print-direction" value={k} checked={direction===k} onChange={()=>setDirection(k)}/>{k==='in'?tr("Ankünfte"):tr("Rückgaben")}</label>)}
   </fieldset>
   <label>{tr("Druckdatum")}<input aria-label={tr("Druckdatum")} type="date" value={date} disabled={busy||loading} onChange={e=>setDate(e.target.value)}/></label>
   <p className="day-print-count" aria-live="polite">{tr("Buchungen zum Drucken")} <strong>{items.length}</strong></p>
   <small>{tr("Stornierte Buchungen werden nicht gedruckt.")}</small>
   {loadError&&<p role="alert" className="error">{loadError}</p>}
   {loading?<p role="status">{tr("Buchungen werden geladen …")}</p>:!valid?<p role="alert">{tr("Bitte ein gültiges Datum wählen.")}</p>:!items.length?<p role="status">{tr("Keine Buchungen für diese Auswahl.")}</p>:null}
   {error&&<p className="error" role="alert">{error}</p>}
   <div className="day-print-actions"><button disabled={busy} onClick={close}>{tr("Abbrechen")}</button><button className="primary" aria-busy={busy} disabled={busy||loading||!!loadError||!!error||!valid||!items.length} onClick={()=>void print()}>{busy?tr("PDF wird erstellt …"):ready?tr("PDF öffnen"):tr("Drucken")}</button></div>
  </section>
 </div>,document.body);
}
