import React,{useEffect,useMemo,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {stamp,money,type Booking} from '../model';
import {trapTab} from './undo-controls';
import type {BookingOperationEvent} from './operations';
import '../booking-actions-sheet.css';

export interface LocationPatch{spot:string;product:string;covered:boolean}
export interface LocationEntry{at:string;spot?:string;product?:string;covered?:boolean;by?:string}
export interface BookingActionsSheetProps{
  booking:Booking;
  onClose:()=>void;
  /** open the existing edit form (no immediate edit when the sheet opens) */
  onEditBooking:()=>void;
  /** persist an actual location change (caller owns the write); absent = disabled */
  onChangeLocation?:(patch:LocationPatch)=>Promise<void>;
  /** audited no-show RPC supplied by the parent; absent = disabled */
  onNoShow?:()=>Promise<void>;
  /** authorized audited cancel RPC supplied by the parent; absent = disabled */
  onCancelBooking?:()=>Promise<void>;
  /** existing secure UndoControls element (reset check-in/out); never manual timestamp clearing */
  undoSlot?:React.ReactNode;
  /** real operation events; null/undefined = unavailable, [] = none */
  operationEvents?:BookingOperationEvent[]|null;
  /** real location history; null/undefined = unavailable */
  locationHistory?:LocationEntry[]|null;
  busy?:boolean;
}
type View='menu'|'location'|'locHistory'|'callHistory'|'noshow'|'cancel';
export const UNAVAILABLE='Verlauf ist noch nicht verfügbar.';
export const NO_CALLS='Keine Anrufe erfasst.';
export const NO_LOCATIONS='Keine Standortänderungen erfasst.';
export function bookingDetailsText(b:Booking){
  return ['Booking #'+b.code,b.external_id&&'External ID: '+b.external_id,'Platform: '+b.platform,'Name: '+b.customer_name,b.phone&&'Phone: '+b.phone,b.email&&'Email: '+b.email,'Persons: '+b.persons,'Car: '+b.plate,'Product: '+b.product+' ('+(b.covered?'covered':'open')+')',b.spot&&'Spot: '+b.spot,'Parking: '+stamp(b.arrival_at),'Return: '+stamp(b.departure_at),b.flight_in&&'Flight in: '+b.flight_in,b.flight_out&&'Flight out: '+b.flight_out,'Total: '+money(b.total),'Paid: '+money(b.paid),'Due: '+money(Math.max(0,b.total-b.paid))].filter(Boolean).join('\n');
}
export async function copyText(text:string,doc:Document=document,nav:Navigator|undefined=typeof navigator!=='undefined'?navigator:undefined){
  try{if(nav?.clipboard?.writeText){await nav.clipboard.writeText(text);return}}catch{/* fall back */}
  const ta=doc.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;opacity:0';doc.body.appendChild(ta);ta.select();let ok=false;try{ok=doc.execCommand('copy')}catch{ok=false}ta.remove();
  if(!ok)throw new Error('Kopieren wird von diesem Gerät nicht unterstützt.');
}
export function callEntries(ev?:BookingOperationEvent[]|null){return ev?ev.filter(e=>e.action==='customer_called').sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)):null}

export function BookingActionsSheet(p:BookingActionsSheetProps){
  const b=p.booking;const[view,setView]=useState<View>('menu'),[msg,setMsg]=useState(''),[err,setErr]=useState(''),[work,setWork]=useState(false);
  const[spot,setSpot]=useState(''),[prod,setProd]=useState(b.product),[cov,setCov]=useState(b.covered);
  const box=useRef<HTMLDivElement>(null),opener=useRef<HTMLElement|null>(null),saving=useRef(false);
  useEffect(()=>{opener.current=document.activeElement as HTMLElement|null;const first=box.current?.querySelector<HTMLElement>('button:not(:disabled),input');first?.focus();return()=>{const o=opener.current;setTimeout(()=>o?.focus(),0)}},[]);
  useEffect(()=>{setErr('');setMsg('');const first=box.current?.querySelector<HTMLElement>('[data-first],button:not(:disabled),input');first?.focus()},[view]);
  const back=()=>{if(saving.current)return;view==='menu'?p.onClose():setView('menu')};
  const keys=(e:React.KeyboardEvent)=>{
    if(e.key==='Escape'){e.stopPropagation();back();return}
    if(e.key!=='Tab')return;
    const f=Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]')||[]).filter(x=>!x.closest('.undo-scrim'));
    if(!f.length||document.querySelector('.undo-scrim'))return;
    const i=f.indexOf(document.activeElement as HTMLElement);e.preventDefault();f[trapTab(i,f.length,e.shiftKey)].focus();
  };
  async function run(fn:()=>Promise<void>,done:()=>void){if(saving.current)return;saving.current=true;setWork(true);setErr('');try{await fn();done()}catch(e){setErr(e instanceof Error?e.message:String(e))}finally{saving.current=false;setWork(false)}}
  const locChanged=(spot.trim()!==''||prod.trim()!==b.product||cov!==b.covered)&&prod.trim()!=='';
  const noshowOk=!!p.onNoShow&&!p.busy&&b.status==='confirmed'&&!b.checked_in_at&&!b.checked_out_at;
  const cancelOk=!!p.onCancelBooking&&!p.busy&&b.status==='confirmed'&&!b.checked_in_at&&!b.checked_out_at;
  const calls=useMemo(()=>callEntries(p.operationEvents),[p.operationEvents]);
  const title=view==='menu'?'Edit':view==='location'?'Change location':view==='locHistory'?'Location history':view==='callHistory'?'Calllist history':view==='cancel'?'Cancel booking':'No show';
  const item=(label:string,onClick:()=>void,o:{disabled?:boolean;danger?:boolean;note?:string}={})=><button type="button" role="menuitem" className={'bas-item'+(o.danger?' danger':'')} disabled={o.disabled} onClick={onClick}><span>{label}</span>{o.note&&<small>{o.note}</small>}</button>;
  return <div className="bas-scrim" onClick={back}>
    <div ref={box} className="bas" role="dialog" aria-modal="true" aria-labelledby="bas-t" onKeyDown={keys} onClick={e=>e.stopPropagation()}>
      <div className="bas-handle" aria-hidden="true"/>
      <header className="bas-head"><h2 id="bas-t">{title}</h2><button type="button" className="bas-x" aria-label={view==='menu'?'Schließen':'Zurück'} onClick={back}><X size={20}/></button></header>
      {err&&<p className="bas-err" role="alert">{err}</p>}{msg&&<p className="bas-msg" role="status">{msg}</p>}
      {view==='menu'&&<div role="menu">
        <h3 className="bas-sec">MODIFY</h3>
        {item('Edit booking',()=>{p.onClose();p.onEditBooking()})}
        {item('Change location',()=>{setSpot('');setProd(b.product);setCov(b.covered);setView('location')},{disabled:!p.onChangeLocation,note:p.onChangeLocation?undefined:'Nicht verfügbar'})}
        <h3 className="bas-sec">TOOLS</h3>
        {item('Copy booking details',()=>{void copyText(bookingDetailsText(b)).then(()=>{setErr('');setMsg('Buchungsdetails kopiert')}).catch(e=>{setMsg('');setErr(e instanceof Error?e.message:String(e))})})}
        {item('Location history',()=>setView('locHistory'))}
        {item('Calllist history',()=>setView('callHistory'))}
        <h3 className="bas-sec">STATUS</h3>
        {item('No show',()=>setView('noshow'),{danger:true,disabled:!noshowOk,note:!p.onNoShow?'Nicht verfügbar':b.status!=='confirmed'?'Buchung ist nicht aktiv':b.checked_in_at?'Bereits eingecheckt':undefined})}
        {!b.checked_in_at&&!b.checked_out_at&&item('Reset check-in',()=>{},{disabled:true,danger:true,note:'Nicht eingecheckt'})}
        {b.checked_out_at&&item('Reset check-in',()=>{},{disabled:true,danger:true,note:'Bitte zuerst den Check-out rückgängig machen.'})}
        {(b.checked_in_at||b.checked_out_at)&&<div className="bas-undo">{p.undoSlot}</div>}
        {item('Cancel booking',()=>setView('cancel'),{danger:true,disabled:!cancelOk,note:!p.onCancelBooking?'Nicht verfügbar':b.status!=='confirmed'?'Buchung ist nicht aktiv':b.checked_in_at?'Bereits eingecheckt':undefined})}
        {item('Close',p.onClose)}
      </div>}
      {view==='location'&&<form className="bas-form" onSubmit={e=>{e.preventDefault();if(!locChanged||!p.onChangeLocation)return;void run(()=>p.onChangeLocation!({spot:spot.trim()||b.spot,product:prod.trim(),covered:cov}),()=>{p.onClose()})}}>
        <p className="bas-hint">Aktuell: Platz {b.spot||'–'} · {b.product} · {b.covered?'überdacht':'Freifläche'}</p>
        <label>Neuer Stellplatz<input data-first value={spot} placeholder={b.spot||'z. B. 12'} onChange={e=>setSpot(e.target.value)} autoComplete="off"/></label>
        <label>Produkt-Code<input value={prod} onChange={e=>setProd(e.target.value)} autoComplete="off"/></label>
        <label className="bas-check"><input type="checkbox" checked={cov} onChange={e=>setCov(e.target.checked)}/>Überdacht</label>
        <div className="bas-row"><button type="button" className="bas-btn" onClick={()=>setView('menu')} disabled={work}>Abbrechen</button><button className="bas-btn primary" disabled={!locChanged||work} aria-busy={work}>{work?'Wird gespeichert …':'Speichern'}</button></div></form>}
      {view==='locHistory'&&<div className="bas-list">{!p.locationHistory?<p className="bas-hint">{UNAVAILABLE}</p>:!p.locationHistory.length?<p className="bas-hint">{NO_LOCATIONS}</p>:p.locationHistory.map((l,i)=><p key={i}><strong>{stamp(l.at)}</strong><span>{[l.spot&&'Platz '+l.spot,l.product,l.covered===undefined?'':l.covered?'überdacht':'Freifläche'].filter(Boolean).join(' · ')}</span></p>)}</div>}
      {view==='callHistory'&&<div className="bas-list">{!calls?<p className="bas-hint">{UNAVAILABLE}</p>:!calls.length?<p className="bas-hint">{NO_CALLS}</p>:calls.map(c=><p key={c.id}><strong>{stamp(c.occurred_at)}</strong><span>Kunde angerufen</span></p>)}</div>}
      {view==='cancel'&&<div className="bas-form"><p className="bas-hint">{b.plate} · #{b.code} wird storniert. Das wird protokolliert.</p>
        <div className="bas-row"><button type="button" className="bas-btn" data-first onClick={()=>setView('menu')} disabled={work}>Abbrechen</button><button type="button" className="bas-btn danger" disabled={work||!cancelOk} aria-busy={work} onClick={()=>void run(()=>p.onCancelBooking!(),()=>p.onClose())}>{work?'Wird gespeichert …':err?'Erneut versuchen':'Buchung stornieren'}</button></div></div>}
      {view==='noshow'&&<div className="bas-form"><p className="bas-hint">{b.plate} · #{b.code} wird als No-Show markiert. Das wird protokolliert.</p>
        <div className="bas-row"><button type="button" className="bas-btn" data-first onClick={()=>setView('menu')} disabled={work}>Abbrechen</button><button type="button" className="bas-btn danger" disabled={work||!noshowOk} aria-busy={work} onClick={()=>void run(()=>p.onNoShow!(),()=>p.onClose())}>{work?'Wird gespeichert …':err?'Erneut versuchen':'Als No-Show markieren'}</button></div></div>}
    </div></div>;
}
export default BookingActionsSheet;
