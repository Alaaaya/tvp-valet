import {t as tr} from './i18n';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {X} from 'lucide-react';
import {stamp,money,type Booking} from '../model';
import {trapTab} from './undo-controls';
import {useEdgeBack} from './use-edge-back';
import type {BookingLocationHistory,BookingCallHistory} from './booking-actions';
import '../booking-actions-sheet.css';

export interface LocationPatch{spot:string}
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
  /** rows from loadBookingCallHistory; null/undefined = unavailable, [] = none */
  callHistory?:BookingCallHistory[]|null;
  /** rows from loadBookingLocationHistory; null/undefined = unavailable, [] = none */
  locationHistory?:BookingLocationHistory[]|null;
  busy?:boolean;
}
type View='menu'|'location'|'locHistory'|'callHistory'|'noshow'|'cancel';
export const UNAVAILABLE="Verlauf ist noch nicht verfügbar.";
export const NO_CALLS="Keine Anrufe erfasst.";
export const NO_LOCATIONS="Keine Standortänderungen erfasst.";
export function bookingDetailsText(b:Booking){
  return [tr("Booking #")+b.code,b.external_id&&tr("External ID: ")+b.external_id,tr("Platform: ")+b.platform,tr("Name: ")+b.customer_name,b.phone&&tr("Phone: ")+b.phone,b.email&&tr("Email: ")+b.email,tr("Persons: ")+b.persons,tr("Car: ")+b.plate,tr("Product: ")+b.product+' ('+(b.covered?'covered':'open')+')',b.spot&&tr("Spot: ")+b.spot,tr("Parking: ")+stamp(b.arrival_at),tr("Return: ")+stamp(b.departure_at),b.flight_in&&tr("Flight in: ")+b.flight_in,b.flight_out&&tr("Flight out: ")+b.flight_out,tr("Total: ")+money(b.total),tr("Paid: ")+money(b.paid),tr("Due: ")+money(Math.max(0,Math.round(b.total*100)-Math.round(b.paid*100))/100)].filter(Boolean).join('\n');
}
export async function copyText(text:string,doc:Document=document,nav:Navigator|undefined=typeof navigator!=='undefined'?navigator:undefined){
  try{if(nav?.clipboard?.writeText){await nav.clipboard.writeText(text);return}}catch{/* fall back */}
  const ta=doc.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;opacity:0';doc.body.appendChild(ta);ta.select();let ok=false;try{ok=doc.execCommand('copy')}catch{ok=false}ta.remove();
  if(!ok)throw new Error(tr("Kopieren wird von diesem Gerät nicht unterstützt."));
}

export function BookingActionsSheet(p:BookingActionsSheetProps){
  const b=p.booking;const[view,setView]=useState<View>('menu'),[msg,setMsg]=useState(''),[err,setErr]=useState(''),[work,setWork]=useState(false);
  const[spot,setSpot]=useState('');
  const box=useRef<HTMLDivElement>(null),opener=useRef<HTMLElement|null>(null),saving=useRef(false);
  useEffect(()=>{opener.current=document.activeElement as HTMLElement|null;const first=box.current?.querySelector<HTMLElement>('button:not(:disabled),input');first?.focus();return()=>{const o=opener.current;setTimeout(()=>o?.focus(),0)}},[]);
  useEffect(()=>{setErr('');setMsg('');const first=box.current?.querySelector<HTMLElement>('[data-first],button:not(:disabled),input');first?.focus()},[view]);
  const draftDirty=()=>view==='location'&&spot.trim()!==''&&spot.trim()!==b.spot;
  /** every dismissal path (X, backdrop, Escape, edge swipe, Abbrechen) goes through here; returns false when blocked/declined */
  const back=():boolean=>{if(saving.current||work)return false;if(draftDirty()&&!window.confirm(tr("Ungespeicherten Standort verwerfen?")))return false;view==='menu'?p.onClose():setView('menu');return true};
  const scrim=useRef<HTMLDivElement>(null);
  useEdgeBack(box,{enabled:true,priority:40,blocked:work,onBack:()=>{if(!back())return false}});
  const keys=(e:React.KeyboardEvent)=>{
    if(e.key==='Escape'){e.stopPropagation();e.preventDefault();back();return}
    if(e.key!=='Tab')return;
    const f=Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]')||[]).filter(x=>!x.closest('.undo-scrim'));
    if(!f.length||document.querySelector('.undo-scrim'))return;
    const i=f.indexOf(document.activeElement as HTMLElement);e.preventDefault();f[trapTab(i,f.length,e.shiftKey)].focus();
  };
  async function run(fn:()=>Promise<void>,done:()=>void){if(saving.current)return;saving.current=true;setWork(true);setErr('');try{await fn();done()}catch(e){setErr(e instanceof Error?e.message:String(e))}finally{saving.current=false;setWork(false)}}
  const locChanged=spot.trim()!==''&&spot.trim()!==b.spot&&spot.trim().length<=100;
  const noshowOk=!!p.onNoShow&&!p.busy&&b.status==='confirmed'&&!b.checked_in_at&&!b.checked_out_at;
  const cancelOk=!!p.onCancelBooking&&!p.busy&&b.status==='confirmed'&&!b.checked_in_at&&!b.checked_out_at;
  const calls=p.callHistory;
  const title=view==='menu'?tr("Edit"):view==='location'?tr("Change location"):view==='locHistory'?tr("Location history"):view==='callHistory'?tr("Calllist history"):view==='cancel'?tr("Cancel booking"):tr("No show");
  const item=(label:string,onClick:()=>void,o:{disabled?:boolean;danger?:boolean;note?:string}={})=><button type="button" role="menuitem" className={'bas-item'+(o.danger?' danger':'')} disabled={o.disabled} onClick={onClick}><span>{label}</span>{o.note&&<small>{o.note}</small>}</button>;
  return <div ref={scrim} className="bas-scrim" onClick={()=>{back()}}>
    <div ref={box} className="bas" role="dialog" aria-modal="true" aria-labelledby="bas-t" onKeyDown={keys} onClick={e=>e.stopPropagation()}>
      <div className="bas-handle" aria-hidden="true"/>
      <header className="bas-head"><h2 id="bas-t">{title}</h2><button type="button" className="bas-x" aria-label={view==='menu'?tr("Schließen"):tr("Zurück")} onClick={()=>{back()}} disabled={work}><X size={20}/></button></header>
      {err&&<p className="bas-err" role="alert">{err}</p>}{msg&&<p className="bas-msg" role="status">{msg}</p>}
      {view==='menu'&&<div role="menu">
        <h3 className="bas-sec">{tr("MODIFY")}</h3>
        {item(tr("Edit booking"),()=>{p.onClose();p.onEditBooking()})}
        {item(tr("Change location"),()=>{setSpot('');setView('location')},{disabled:!p.onChangeLocation,note:p.onChangeLocation?undefined:tr("Nicht verfügbar")})}
        <h3 className="bas-sec">{tr("TOOLS")}</h3>
        {item(tr("Copy booking details"),()=>{void copyText(bookingDetailsText(b)).then(()=>{setErr('');setMsg(tr("Buchungsdetails kopiert"))}).catch(e=>{setMsg('');setErr(e instanceof Error?e.message:String(e))})})}
        {item(tr("Location history"),()=>setView('locHistory'))}
        {item(tr("Calllist history"),()=>setView('callHistory'))}
        <h3 className="bas-sec">{tr("STATUS")}</h3>
        {item(tr("No show"),()=>setView('noshow'),{danger:true,disabled:!noshowOk,note:!p.onNoShow?tr("Nicht verfügbar"):b.status!=='confirmed'?tr("Buchung ist nicht aktiv"):b.checked_in_at?tr("Bereits eingecheckt"):undefined})}
        {b.checked_out_at&&item(tr("Reset check-in"),()=>{},{disabled:true,danger:true,note:tr("Bitte zuerst den Check-out rückgängig machen.")})}
        {(b.checked_in_at||b.checked_out_at)&&<div className="bas-undo">{p.undoSlot}</div>}
        {item(tr("Cancel booking"),()=>setView('cancel'),{danger:true,disabled:!cancelOk,note:!p.onCancelBooking?tr("Nicht verfügbar"):b.status!=='confirmed'?tr("Buchung ist nicht aktiv"):b.checked_in_at?tr("Bereits eingecheckt"):undefined})}
        {item(tr("Close"),p.onClose)}
      </div>}
      {view==='location'&&<form className="bas-form" onSubmit={e=>{e.preventDefault();if(!locChanged||!p.onChangeLocation)return;void run(()=>p.onChangeLocation!({spot:spot.trim()}),()=>{p.onClose()})}}>
        <p className="bas-hint">{tr("Aktuell: Platz")}{b.spot||'–'}</p>
        <label>{tr("Neuer Stellplatz")}<input data-first maxLength={100} value={spot} placeholder={b.spot||tr("z. B. 12")} onChange={e=>setSpot(e.target.value)} autoComplete="off"/></label>
        <div className="bas-row"><button type="button" className="bas-btn" onClick={()=>{back()}} disabled={work}>{tr("Abbrechen")}</button><button className="bas-btn primary" disabled={!locChanged||work} aria-busy={work}>{work?tr("Wird gespeichert …"):tr("Speichern")}</button></div></form>}
      {view==='locHistory'&&<div className="bas-list">{!p.locationHistory?<p className="bas-hint">{tr(UNAVAILABLE)}</p>:!p.locationHistory.length?<p className="bas-hint">{tr(NO_LOCATIONS)}</p>:p.locationHistory.map(l=><p key={l.id}><strong>{stamp(l.occurred_at)}</strong><span>{(l.old_spot||'–')+' → '+(l.new_spot||'–')}{l.actor_name?' · '+l.actor_name:''}</span></p>)}</div>}
      {view==='callHistory'&&<div className="bas-list">{!calls?<p className="bas-hint">{tr(UNAVAILABLE)}</p>:!calls.length?<p className="bas-hint">{tr(NO_CALLS)}</p>:calls.map(c=><p key={c.id}><strong>{stamp(c.occurred_at)}</strong><span>{tr("Kunde angerufen")}{c.actor_name?' · '+c.actor_name:''}</span></p>)}</div>}
      {view==='cancel'&&<div className="bas-form"><p className="bas-hint">{b.plate} {"· #"}{b.code} {tr("wird storniert. Das wird protokolliert.")}</p>
        <div className="bas-row"><button type="button" className="bas-btn" data-first onClick={()=>setView('menu')} disabled={work}>{tr("Abbrechen")}</button><button type="button" className="bas-btn danger" disabled={work||!cancelOk} aria-busy={work} onClick={()=>void run(()=>p.onCancelBooking!(),()=>p.onClose())}>{work?tr("Wird gespeichert …"):err?tr("Erneut versuchen"):tr("Buchung stornieren")}</button></div></div>}
      {view==='noshow'&&<div className="bas-form"><p className="bas-hint">{b.plate} {"· #"}{b.code} {tr("wird als No-Show markiert. Das wird protokolliert.")}</p>
        <div className="bas-row"><button type="button" className="bas-btn" data-first onClick={()=>setView('menu')} disabled={work}>{tr("Abbrechen")}</button><button type="button" className="bas-btn danger" disabled={work||!noshowOk} aria-busy={work} onClick={()=>void run(()=>p.onNoShow!(),()=>p.onClose())}>{work?tr("Wird gespeichert …"):err?tr("Erneut versuchen"):tr("Als No-Show markieren")}</button></div></div>}
    </div></div>;
}
export default BookingActionsSheet;
