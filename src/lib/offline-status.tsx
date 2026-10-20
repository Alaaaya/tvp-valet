import React,{useState,useSyncExternalStore} from 'react';
import {offlineSnapshot,subscribeOffline,retryOffline,discardOfflineFrom,applyOfflineUpdate} from './offline-client';
import {t as tr} from './i18n';
import {useLanguage} from './i18n';
import './offline-status.css';
import {durableOfflineEnabled} from './offline-capability';

export function OfflineStatusBanner(){
 useLanguage();
 const state=useSyncExternalStore(subscribeOffline,offlineSnapshot,offlineSnapshot);
 const [review,setReview]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 if(!state.ready)return null;

 const writes=durableOfflineEnabled();
 const blocked=state.events.filter(e=>e.state==='conflict'||e.state==='failed').length;
 const discard=async(sequence:number)=>{
  if(!window.confirm(tr("Diese Änderung und alle nachfolgenden abhängigen Änderungen endgültig verwerfen? Nicht synchronisierte Zahlungen werden nicht als bestätigt gespeichert.")))return;
  setBusy(true);setError('');
  try{await discardOfflineFrom(sequence,true)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 const update=()=>{
  if(state.pending||state.syncing||document.querySelector('form,[role="dialog"]:not([hidden]),.ho-flow,.camera-screen,.sign-screen')||!applyOfflineUpdate())setError(tr("Aktualisierung wartet. Bitte zuerst Änderungen synchronisieren und offene Eingaben schließen."));
 };
 const action=(kind:string)=>tr(({payment:'Zahlung',safe_edit:'Buchung bearbeiten',detail:'Buchungsaktion',handover:'Übergabe',undo_handover:'Übergabe rückgängig',customer_call:'Anruf speichern',clear_customer_call:'Anruf löschen',operation:'Fahrzeugaktion',update_ops:'Buchungsdaten'} as const)[kind]??'Buchungsaktion');
 return <aside className="offline-status" aria-label={tr("Offline & Synchronisierung")}>
  <div className="offline-status-line" role="status" aria-live="polite">
   <span>{state.online?tr("Online"):tr("Offline")} · {state.syncing?tr("Synchronisierung läuft …"):state.pending?state.pending+' '+tr("ausstehend"):tr("Keine ausstehenden Änderungen")}{blocked?' · '+blocked+' '+tr("Konflikte / Fehler"):''}</span>
   {writes&&<button type="button" disabled={busy||state.syncing||!state.online} onClick={()=>void retryOffline(true)}>{tr("Erneut synchronisieren")}</button>}
   {writes&&<button type="button" aria-expanded={review} onClick={()=>setReview(v=>!v)}>{review?tr("Schließen"):tr("Prüfen")}</button>}
  </div>
  {state.shell==='waiting'&&<button type="button" disabled={busy||state.pending>0||state.syncing} onClick={update}>{tr("Neue Version laden")}</button>}
  <p>{tr(state.shell==='ready'||state.shell==='waiting'?"Offline-App installiert":state.shell==='installing'?"Offline-App wird vorbereitet …":"Offline-App nicht installiert. Gespeicherte Daten allein garantieren keinen Offline-Neustart.")}</p>
  {!writes&&<p>{tr("Offline-Änderungen sind deaktiviert. Bitte mit Internetverbindung speichern.")}</p>}
  {!state.online&&<p>{tr(writes?"Nur gespeicherte Buchungen verfügbar. Änderungen bleiben lokal bis zur Synchronisierung.":"Nur gespeicherte Buchungen verfügbar. Zum Speichern ist eine Internetverbindung erforderlich.")}</p>}
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
 </aside>
}
