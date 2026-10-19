import {t as tr} from './i18n';
import React,{useEffect,useRef,useState} from 'react';
import {useEdgeBackBlock} from './use-edge-back';
import type {Booking} from '../model';
import '../booking-payment.css';
import {Fa} from './fa-icons';

export type PayMethod='cash'|'card'|'bank_transfer';
export const METHODS:{id:PayMethod;label:string}[]=[{id:'cash',label:"Bargeld"},{id:'card',label:"Karte"},{id:'bank_transfer',label:"Überweisung"}];
export type RecordPayment=(a:{booking:Booking;requestId:string;amountCents:number;method:PayMethod})=>Promise<Booking>;

export const toCents=(v:unknown)=>Math.round((Number(v)||0)*100);
export const dueCents=(b:{total?:number|null;paid?:number|null})=>Math.max(0,toCents(b.total)-toCents(b.paid));
export const fmtEur=(c:number)=>(c/100).toFixed(2).replace('.',',')+' €';
export const centsToInput=(c:number)=>(c/100).toFixed(2).replace('.',',');

/** Exact parse of an euro amount (max 2 decimals, , or . separator) into cents. null = invalid. */
export function parseEuroToCents(s:string):number|null{
 const t=s.trim().replace(/\s|€/g,'');
 if(!/^\d{1,7}([.,]\d{1,2})?$/.test(t))return null;
 const [i,f='']=t.replace(',','.').split('.');
 return Number(i)*100+Number((f+'00').slice(0,2));
}
export function validateAmount(s:string,due:number):{cents:number|null;error:string}{
 const c=parseEuroToCents(s);
 if(c===null)return{cents:null,error:tr("Bitte gültigen Betrag eingeben (z. B. 25,50).")};
 if(c<=0)return{cents:null,error:tr("Betrag muss größer als 0 sein.")};
 if(c>due)return{cents:null,error:tr("Betrag höher als offener Betrag (")+fmtEur(due)+').'};
 return{cents:c,error:''};
}
/** UUIDv4 via CSPRNG only; returns null when unavailable (no fake fallback). */
export function uuid():string|null{
 const c=globalThis.crypto;if(!c||typeof c.getRandomValues!=='function')return null;
 const b=c.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
 return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}

export type Receipt={paid_after_cents:number};
/** Adapter: pass backend recordBookingPayment; result is the booking with authoritative paid (other fields stale, parent should refresh). */
export const adaptReceipt=(record:(i:{booking:Booking;requestId:string;amountCents:number;method:PayMethod})=>Promise<Receipt>):RecordPayment=>async input=>{const rc=await record(input);return{...input.booking,paid:rc.paid_after_cents/100};};
export const cashBlocked=(b:{key_cash?:string|null})=>/[0-9]/.test(b.key_cash??'');
export const CASH_BLOCK_TEXT="Barzahlung gesperrt: Es gibt bereits einen Bargeld-/Schlüsselvermerk, der erst geklärt werden muss. Karte oder Überweisung sind möglich.";

type Props={booking:Booking;onPaid:(b:Booking)=>void;disabled?:boolean;recordPayment?:RecordPayment;initialOpen?:boolean;hideSummary?:boolean};

export function BookingPayment({booking,onPaid,disabled,recordPayment,initialOpen,hideSummary}:Props){
 const due=dueCents(booking);
 const [open,setOpen]=useState(!!initialOpen);
 const [method,setMethod]=useState<PayMethod>(cashBlocked(booking)?'card':'cash');
 const [amount,setAmount]=useState(centsToInput(due));
 const [confirm,setConfirm]=useState(false);
 const [busy,setBusy]=useState(false);
 const [err,setErr]=useState('');
 const busyRef=useRef(false);
 useEdgeBackBlock(open||confirm||busy);
 const cardRef=useRef<HTMLDivElement>(null);const openerRef=useRef<HTMLElement|null>(null);
 const req=useRef({key:'',id:''});
 const v=validateAmount(amount,due);
 const blocked=cashBlocked(booking);
 const canPay=!disabled&&!!recordPayment&&booking.status==='confirmed';
 useEffect(()=>{if(!open){setAmount(centsToInput(due));setConfirm(false);setErr('');}},[open,due]);
 const close=()=>{if(!busyRef.current)setOpen(false);};
 useEffect(()=>{
  if(!open)return;
  const card=cardRef.current;if(!card)return;
  const foc=()=>[...card.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')];
  (foc()[0]||card).focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.stopPropagation();e.preventDefault();close();return;}
   if(e.key!=='Tab')return;
   const f=foc();if(!f.length){e.preventDefault();return;}
   const first=f[0],last=f[f.length-1],a=document.activeElement;
   if(!card.contains(a)){e.preventDefault();first.focus();}
   else if(e.shiftKey&&a===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&a===last){e.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',key,true);
  const op=openerRef.current;
  return()=>{document.removeEventListener('keydown',key,true);op?.focus?.();};
 },[open]);
 useEffect(()=>{if(open&&!canPay&&!busyRef.current)setOpen(false);},[open,canPay]);
 const requestId=()=>{const k=[booking.id,toCents(booking.paid),toCents(booking.total),booking.status,v.cents,method].join('|');if(req.current.key!==k){const id=uuid();if(!id)return null;req.current={key:k,id};}return req.current.id;};
 const submit=async()=>{
  if(busyRef.current||!canPay||!recordPayment||v.cents===null||(method==='cash'&&blocked)||v.cents>dueCents(booking))return;
  const snap=booking;
  busyRef.current=true;setBusy(true);setErr('');
  try{const rid=requestId();if(!rid)throw new Error(tr("Sichere Anfrage-ID nicht verfügbar. Zahlung nicht möglich."));const updated=await recordPayment({booking:snap,requestId:rid,amountCents:v.cents,method});
   req.current={key:'',id:''};setOpen(false);onPaid(updated);}
  catch(e:any){setErr(e?.message||tr("Zahlung konnte nicht gespeichert werden."));}
  finally{busyRef.current=false;setBusy(false);}
 };
 return <section className="bpay" aria-label={tr("Zahlung")}>
  {!hideSummary&&<h3 className="bpay-h">{tr("Kostenübersicht")}</h3>}
  {!hideSummary&&<dl className="bpay-sum"><div><dt>{tr("Gesamt")}</dt><dd>{fmtEur(toCents(booking.total))}</dd></div><div><dt>{tr("Bezahlt")}</dt><dd>{fmtEur(toCents(booking.paid))}</dd></div><div className={due>0?'due':'ok'}><dt>{tr("Offen")}</dt><dd>{fmtEur(due)}</dd></div></dl>}
  {due>0&&<button type="button" className="bpay-main" disabled={!canPay} onClick={e=>{openerRef.current=e.currentTarget;setOpen(true);}}><Fa name="money-bill-1-regular" size={17}/>{tr("Als bezahlt markieren")}</button>}
  {due>0&&!canPay&&<p className="bpay-note">{booking.status!=='confirmed'?tr("Zahlung nur für bestätigte Buchungen."):tr("Zahlung nur für Admin/Mitarbeiter verfügbar.")}</p>}
  {due>0&&<div className="bpay-soon">{([[tr("Zahlungslink per E-Mail"),'envelope'],[tr("Rechnung per E-Mail"),'file-lines'],[tr("QR-Zahlung"),'qrcode']] as const).map(([t,i])=><button key={t} type="button" disabled aria-disabled="true">{t}<Fa name={i} size={15}/> <em>{tr("bald")}</em></button>)}</div>}
  {open&&<div className="bpay-sheet" onClick={e=>{e.stopPropagation();if(e.target===e.currentTarget)close();}} onPointerDown={e=>e.stopPropagation()}>
   <div className="bpay-card" data-edge-back-modal ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="bpay-title" tabIndex={-1} onClick={e=>e.stopPropagation()}>
    <h4 id="bpay-title">{tr("Zahlungsart")}</h4>
    <div className="bpay-methods" role="radiogroup" aria-label={tr("Zahlungsart")}>{METHODS.map(m=><button key={m.id} type="button" role="radio" aria-checked={method===m.id} className={method===m.id?'on':''} disabled={busy||(m.id==='cash'&&blocked)} onClick={()=>{setMethod(m.id);setConfirm(false);}}>{tr(m.label as import("./i18n").TranslationKey)}</button>)}</div>
    {blocked&&<p className="bpay-note" role="note">{tr(CASH_BLOCK_TEXT)}</p>}
    <label className="bpay-l" htmlFor="bpay-amt">{tr("Betrag (€), offen")}{fmtEur(due)}</label>
    <input id="bpay-amt" className="bpay-in" inputMode="decimal" autoComplete="off" value={amount} disabled={busy} onChange={e=>{setAmount(e.target.value);setConfirm(false);}} aria-invalid={!!v.error} aria-describedby={v.error?'bpay-amt-err':undefined}/>
    {v.error&&<p id="bpay-amt-err" className="bpay-err" role="alert">{v.error}</p>}
    {confirm&&canPay&&v.cents!==null&&<p className="bpay-conf">{fmtEur(v.cents)} {tr("per")}{tr(METHODS.find(m=>m.id===method)!.label as import("./i18n").TranslationKey)} {tr("buchen? Verbucht wird mit deinem Namen und Zeitstempel.")}</p>}
    {err&&<p className="bpay-err" role="alert">{err}</p>}
    <div className="bpay-act">
     <button type="button" className="bpay-cancel" disabled={busy} onClick={close}>{tr("Abbrechen")}</button>
     {!(confirm&&canPay)?<button type="button" className="bpay-ok" disabled={v.cents===null} onClick={()=>setConfirm(true)}>{tr("Weiter")}</button>
      :<button type="button" className="bpay-ok" disabled={busy||v.cents===null||(method==='cash'&&blocked)} onClick={submit}>{busy?tr("Speichern…"):tr("Bestätigen")}</button>}
    </div>
   </div></div>}
 </section>;
}
