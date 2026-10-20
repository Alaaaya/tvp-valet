import React,{useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {offlineSnapshot,subscribeOffline,discardOfflineFrom} from './offline-client';
import {createPortal} from 'react-dom';
import {t as tr} from './i18n';
import {useLanguage} from './i18n';
import './offline-status.css';
import {durableOfflineEnabled} from './offline-capability';

export function OfflineStatusBanner(){
 useLanguage();
 const state=useSyncExternalStore(subscribeOffline,offlineSnapshot,offlineSnapshot);
 const [open,setOpen]=useState(false);
 const dialog=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(state.online)setOpen(false)},[state.online]);
 useEffect(()=>{
  if(!open||state.online)return;
  const previous=document.activeElement as HTMLElement|null;
  dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();setOpen(false)}
   if(e.key==='Tab'){const items=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]')??[]);const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
  };
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus()};
 },[open,state.online]);
 const [review,setReview]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 if(!state.ready||state.online)return null;

 const writes=durableOfflineEnabled();
 const blocked=state.events.filter(e=>e.state==='conflict'||e.state==='failed').length;
 const discard=async(sequence:number)=>{
  if(!window.confirm(tr("Diese Änderung und alle nachfolgenden abhängigen Änderungen endgültig verwerfen? Nicht synchronisierte Zahlungen werden nicht als bestätigt gespeichert.")))return;
  setBusy(true);setError('');
  try{await discardOfflineFrom(sequence,true)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 const action=(kind:string)=>tr(({payment:'Zahlung',safe_edit:'Buchung bearbeiten',detail:'Buchungsaktion',handover:'Übergabe',undo_handover:'Übergabe rückgängig',customer_call:'Anruf speichern',clear_customer_call:'Anruf löschen',operation:'Fahrzeugaktion',update_ops:'Buchungsdaten'} as const)[kind]??'Buchungsaktion');
 return <><button type="button" className="offline-indicator" aria-label={tr("Offline & Synchronisierung")+(state.pending?' · '+state.pending+' '+tr("ausstehend"):'')} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>
  <span className="offline-ring" aria-hidden="true"/>{state.pending>0&&<span className="offline-count" aria-hidden="true">{state.pending}</span>}
 </button>{open&&createPortal(<div className="offline-status-backdrop" onClick={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
 <div ref={dialog} className="offline-status" role="dialog" aria-modal="true" aria-label={tr("Offline & Synchronisierung")}>
  <header><strong>{tr("Offline")}{state.pending?' · '+state.pending+' '+tr("ausstehend"):''}</strong><button type="button" onClick={()=>setOpen(false)} aria-label={tr("Schließen")}>×</button></header>
  <p>{tr(writes?"Nur gespeicherte Buchungen verfügbar. Änderungen bleiben lokal bis zur Synchronisierung.":"Nur gespeicherte Buchungen verfügbar. Zum Speichern ist eine Internetverbindung erforderlich.")}</p>
  {blocked>0&&<p role="alert">{blocked+' '+tr("Konflikte / Fehler")}</p>}
  {writes&&state.pending>0&&<button type="button" aria-expanded={review} onClick={()=>setReview(v=>!v)}>{review?tr("Schließen"):tr("Prüfen")}</button>}
  {(state.error||error)&&<p role="alert" className="offline-status-error">{error||state.error}</p>}
  {review&&<div className="offline-review">
   <p>{tr("Nicht synchronisierte Zahlungen sind noch nicht serverbestätigt.")}</p>
   {!state.storagePersistent&&<p>{tr("Gerätespeicher nicht dauerhaft zugesichert. Browserdaten nicht löschen.")}</p>}
   {state.events.map(event=><div className="offline-event" key={event.id}>
    <strong>{action(event.kind)}</strong>
    <time dateTime={new Date(event.createdAt).toISOString()}>{new Date(event.createdAt).toLocaleString()}</time>
    <small dir="ltr">{event.bookingId}</small>
    <span>{tr(event.state==='conflict'?'Konflikt':event.state==='failed'?'Fehlgeschlagen':event.state==='sending'?'Wird synchronisiert':'Ausstehend')}</span>
    {event.error&&<p role="alert">{event.error}</p>}
    <button type="button" disabled={busy||state.syncing} onClick={()=>void discard(event.seq)}>{tr("Ab hier verwerfen …")}</button>
   </div>)}
  </div>}
 </div></div>,document.body)}</>
}
