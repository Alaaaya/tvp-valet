import React,{useEffect,useRef,useState} from 'react';
import type {Booking} from '../model';
import '../booking-payment.css';

export type PayMethod='cash'|'card'|'bank_transfer';
export const METHODS:{id:PayMethod;label:string}[]=[{id:'cash',label:'Bargeld'},{id:'card',label:'Karte'},{id:'bank_transfer',label:'Überweisung'}];
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
 if(c===null)return{cents:null,error:'Bitte gültigen Betrag eingeben (z. B. 25,50).'};
 if(c<=0)return{cents:null,error:'Betrag muss größer als 0 sein.'};
 if(c>due)return{cents:null,error:'Betrag höher als offener Betrag ('+fmtEur(due)+').'};
 return{cents:c,error:''};
}
const uuid=()=>globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():'r-'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);

type Props={booking:Booking;onPaid:(b:Booking)=>void;disabled?:boolean;recordPayment?:RecordPayment;initialOpen?:boolean};

export function BookingPayment({booking,onPaid,disabled,recordPayment,initialOpen}:Props){
 const due=dueCents(booking);
 const [open,setOpen]=useState(!!initialOpen);
 const [method,setMethod]=useState<PayMethod>('cash');
 const [amount,setAmount]=useState(centsToInput(due));
 const [confirm,setConfirm]=useState(false);
 const [busy,setBusy]=useState(false);
 const [err,setErr]=useState('');
 const busyRef=useRef(false);
 const req=useRef({key:'',id:''});
 const v=validateAmount(amount,due);
 const canPay=!disabled&&!!recordPayment;
 useEffect(()=>{if(!open){setAmount(centsToInput(due));setConfirm(false);setErr('');}},[open,due]);
 const requestId=()=>{const k=[booking.id,v.cents,method].join('|');if(req.current.key!==k)req.current={key:k,id:uuid()};return req.current.id;};
 const submit=async()=>{
  if(busyRef.current||!recordPayment||v.cents===null)return;
  busyRef.current=true;setBusy(true);setErr('');
  try{const updated=await recordPayment({booking,requestId:requestId(),amountCents:v.cents,method});
   req.current={key:'',id:''};setOpen(false);onPaid(updated);}
  catch(e:any){setErr(e?.message||'Zahlung konnte nicht gespeichert werden.');}
  finally{busyRef.current=false;setBusy(false);}
 };
 return <section className="bpay" aria-label="Zahlung">
  <h3 className="bpay-h">Kostenübersicht</h3>
  <dl className="bpay-sum"><div><dt>Gesamt</dt><dd>{fmtEur(toCents(booking.total))}</dd></div><div><dt>Bezahlt</dt><dd>{fmtEur(toCents(booking.paid))}</dd></div><div className={due>0?'due':'ok'}><dt>Offen</dt><dd>{fmtEur(due)}</dd></div></dl>
  {due>0&&<button type="button" className="bpay-main" disabled={!canPay} onClick={()=>setOpen(true)}>Als bezahlt markieren</button>}
  {due>0&&!canPay&&<p className="bpay-note">Zahlung nur für Admin/Mitarbeiter verfügbar.</p>}
  <div className="bpay-soon">{['Zahlungslink per E-Mail','Rechnung per E-Mail','QR-Zahlung'].map(t=><button key={t} type="button" disabled aria-disabled="true">{t} <em>bald</em></button>)}</div>
  {open&&<div className="bpay-sheet" role="dialog" aria-modal="true" aria-label="Zahlung erfassen">
   <div className="bpay-card">
    <h4>Zahlungsart</h4>
    <div className="bpay-methods" role="radiogroup">{METHODS.map(m=><button key={m.id} type="button" role="radio" aria-checked={method===m.id} className={method===m.id?'on':''} disabled={busy} onClick={()=>{setMethod(m.id);setConfirm(false);}}>{m.label}</button>)}</div>
    <label className="bpay-l" htmlFor="bpay-amt">Betrag (€), offen {fmtEur(due)}</label>
    <input id="bpay-amt" className="bpay-in" inputMode="decimal" autoComplete="off" value={amount} disabled={busy} onChange={e=>{setAmount(e.target.value);setConfirm(false);}} aria-invalid={!!v.error}/>
    {v.error&&<p className="bpay-err" role="alert">{v.error}</p>}
    {confirm&&v.cents!==null&&<p className="bpay-conf">{fmtEur(v.cents)} per {METHODS.find(m=>m.id===method)!.label} buchen? Verbucht wird mit deinem Namen und Zeitstempel.</p>}
    {err&&<p className="bpay-err" role="alert">{err}</p>}
    <div className="bpay-act">
     <button type="button" className="bpay-cancel" disabled={busy} onClick={()=>setOpen(false)}>Abbrechen</button>
     {!confirm?<button type="button" className="bpay-ok" disabled={v.cents===null} onClick={()=>setConfirm(true)}>Weiter</button>
      :<button type="button" className="bpay-ok" disabled={busy||v.cents===null} onClick={submit}>{busy?'Speichern…':'Bestätigen'}</button>}
    </div>
   </div></div>}
 </section>;
}
