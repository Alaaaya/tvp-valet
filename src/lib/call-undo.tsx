import {t as tr} from './i18n';
import React,{useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {PhoneOff} from 'lucide-react';
import {removeCustomerCall} from './customer-calls';
import type {CustomerCallBooking} from './customer-calls';
import {trapTab} from './undo-controls';
import './../call-undo.css';

const tz='Europe/Berlin';
const fmt=new Intl.DateTimeFormat('de-DE',{timeZone:tz,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
export const callStamp=(v?:string|null)=>{const n=v?Date.parse(v):NaN;return Number.isFinite(n)?fmt.format(n):''};
/** Delete button only for an existing, valid current call timestamp on a known staff booking. */
type Removable={status?:string;checked_out_at?:string|null;lifecycle_revision?:number;customer_called_at?:string|null};
export const canRemoveCall=(b:Removable,known:boolean)=>known&&b.status==='confirmed'&&b.checked_out_at===null&&
  typeof b.lifecycle_revision==='number'&&Number.isSafeInteger(b.lifecycle_revision)&&b.lifecycle_revision>=0&&
  !!b.customer_called_at&&callStamp(b.customer_called_at)!=='';
export const removeKey=(b:{id:string;customer_called_at?:string|null;lifecycle_revision?:number})=>b.id+':remove:'+(b.customer_called_at||'')+':'+(b.lifecycle_revision??'');
export const isStale=(e:unknown)=>{const c=(e as {code?:string})?.code;return c==='PT409'||c==='40001'||(e as {name?:string})?.name==='CustomerCallConflictError'};

export function CallUndo({booking,known,variant,session,onDone,onReload}:{booking:CustomerCallBooking;known:boolean;variant:'row'|'detail';session?:string;onDone:()=>void|Promise<void>;onReload?:()=>void|Promise<void>}){
  const [snap,setSnap]=useState<CustomerCallBooking|null>(null),[busy,setBusy]=useState(false),[err,setErr]=useState(''),[info,setInfo]=useState(''),[stale,setStale]=useState(false),[retry,setRetry]=useState(false),[refreshErr,setRefreshErr]=useState('');
  const uid=useId(),tid='cu-t'+uid,did='cu-d'+uid,latestSession=useRef(session),openSession=useRef(session),saving=useRef(false),alive=useRef(true),ids=useRef<Record<string,string>>({}),dlg=useRef<HTMLDivElement>(null),cancel=useRef<HTMLButtonElement>(null),opener=useRef<HTMLElement|null>(null);
  latestSession.current=session;
  const fresh=()=>alive.current&&latestSession.current===openSession.current;
  const reset=()=>{setSnap(null);setErr('');setInfo('');setStale(false);setRetry(false)};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  useEffect(()=>{if(snap)cancel.current?.focus()},[snap]);
  // session change: close dialog and forget every request id immediately
  useEffect(()=>{ids.current={};setRefreshErr('');reset()},[session]);
  // keep the snapshot in sync with fresh data. never while stale (explicit reload needed) or in flight.
  useEffect(()=>{if(!snap||busy||stale||retry)return;
    if(!canRemoveCall(booking,known)){reset();return}
    if((booking.customer_called_at||'')!==(snap.customer_called_at||'')||booking.lifecycle_revision!==snap.lifecycle_revision){setSnap({...booking});setErr('');setRetry(false)}
  },[booking.status,booking.checked_out_at,booking.customer_called_at,booking.lifecycle_revision,known,busy,stale,retry]);
  if(!canRemoveCall(booking,known)&&!snap)return null;
  const close=()=>{if(saving.current)return;reset();const o=opener.current;setTimeout(()=>o?.focus(),0)};
  const keys=(e:React.KeyboardEvent)=>{
    if(e.key==='Escape'){e.stopPropagation();close();return}
    if(e.key!=='Tab')return;
    const f=Array.from(dlg.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')||[]);
    if(!f.length){e.preventDefault();dlg.current?.focus();return}
    const i=f.indexOf(document.activeElement as HTMLElement);e.preventDefault();f[trapTab(i,f.length,e.shiftKey)].focus();
  };
  async function reloadNow():Promise<boolean>{
    try{if(fresh())await onReload?.();return true}
    catch(e){if(alive.current)setErr((e instanceof Error?e.message:String(e))+' '+tr("Bitte erneut versuchen."));return false}
  }
  async function go(){
    if(!snap||saving.current)return;
    saving.current=true;setBusy(true);
    try{
      if(stale){setErr('');if(await reloadNow()&&alive.current){setStale(false);setInfo('')}return}
      setErr('');
      const key=removeKey(snap);ids.current[key]=ids.current[key]||crypto.randomUUID();
      let ok=false;
      try{await removeCustomerCall({booking:snap,requestId:ids.current[key]});delete ids.current[key];ok=true}
      catch(e){if(alive.current){
        if(isStale(e)){setRetry(false);setStale(true);setInfo(tr("Die Buchung wurde inzwischen geändert. Bitte neu laden."));if(await reloadNow()&&alive.current)setStale(false)}
        else{setErr((e instanceof Error?e.message:String(e))+' '+tr("Bitte erneut versuchen."));setRetry(true)}}}
      if(ok){
        if(alive.current)reset();
        // the clear succeeded; a failing refresh is reported separately and never replays the clear
        try{if(fresh())await onDone()}catch(e){if(alive.current)setRefreshErr((e instanceof Error?e.message:String(e)))}
      }
    }finally{saving.current=false;if(alive.current)setBusy(false)}
  }
  const label=tr("Anruf löschen");
  return <>
    {refreshErr&&<span className="call-undo-err" role="alert">{refreshErr}</span>}{canRemoveCall(booking,known)&&<button type="button" className={'call-undo-btn call-undo-'+variant} aria-label={label} title={label} onClick={e=>{e.stopPropagation();e.preventDefault();opener.current=e.currentTarget;openSession.current=latestSession.current;setErr('');setInfo('');setStale(false);setRetry(false);setRefreshErr('');setSnap({...booking})}}><PhoneOff size={variant==='row'?13:14}/><span>{label}</span></button>}
    {snap&&typeof document!=='undefined'&&createPortal(<div className="call-undo-scrim" onClick={e=>{e.stopPropagation();close()}} onPointerDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onTouchMove={e=>e.stopPropagation()}><div ref={dlg} tabIndex={-1} onKeyDown={e=>{e.stopPropagation();keys(e)}} className="call-undo-dlg" role="alertdialog" aria-modal="true" aria-labelledby={tid} aria-describedby={did} onClick={e=>e.stopPropagation()}>
      <h3 id={tid}>{label+'?'}</h3>
      <p id={did}><strong>{snap.plate||'–'}</strong> · {snap.customer_name}<br/>{tr("Aufgezeichneter Anruf")}: {callStamp(snap.customer_called_at)}<br/>{tr("Nur der irrtümlich erfasste aktuelle Anruf wird entfernt. Der Verlauf bleibt erhalten.")}</p>
      {info&&<div className="call-undo-err" role="status">{info}</div>}
      {err&&<div className="call-undo-err" role="alert">{err}</div>}
      <button ref={cancel} type="button" className="call-undo-cancel" disabled={busy} onClick={close}>{tr("Abbrechen")}</button>
      <button type="button" className="call-undo-ok" disabled={busy} aria-busy={busy} onClick={go}>{busy?tr("Wird gelöscht …"):stale?tr("Neu laden"):retry?tr("Erneut versuchen"):label}</button>
    </div></div>,document.body)}
  </>;
}
