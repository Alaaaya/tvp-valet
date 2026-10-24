import {t as tr,getLanguage} from './i18n';
import {useHold,PickupMenuButton} from './pickup-undo-view';
import React,{useState} from 'react';
import {PrintSheetsButton} from './print-sheets-button';
import {GefahrenButton} from './gefahren-picker';
import {day} from '../model';
import {ReferenceIcon} from './reference-icon';
import {OdometerCapture} from './odometer-capture';
import {Banknote,Camera,Car,Check,ChevronLeft,KeyRound,MessageSquare,Plus} from 'lucide-react';
import {clock,money,stamp,type Booking} from '../model';
import {displayComment} from './comments';
import {paymentInstruction} from './payment-note';
import '../payment-note.css';
import type {BookingOperations,BookingOperationAction} from './operations';
import '../booking-detail.css';
import {Fa} from './fa-icons';
import {partnerBadge} from './booking-list-row';
import type {Attribution} from './attribution';
import {returnNeedsCall} from './call-phase';

/** Recorded customer call: same button look as "Hat angerufen" in the side's colour (green Anreise, pink Retour),
 * with the call time and who recorded it as legible text. */
export function CallDone({side,time,by,disabled,onClick}:{side:'in'|'out';time:string;by?:string;disabled?:boolean;onClick:()=>void}){
  return <button type="button" className={'op-btn '+side+' fp-call-done'} data-side={side} aria-label={tr("Kunde angerufen")+' '+time+(by?' · '+tr("von ")+by:'')} disabled={disabled} onClick={onClick}>
    <span className="fp-call-done-text"><span className="fp-call-done-main"><ReferenceIcon name="phone" size={13}/><span className="fp-call-done-label">{tr("Has called")}{' '}<time>{time}</time></span></span>{by&&<span className="fp-call-done-by"><span className="fp-call-done-sep" aria-hidden="true">{' · '}</span>{tr("von ")}<bdi>{by}</bdi></span>}</span></button>;
}
/** Return (Retour) call already recorded. Tapping opens the repeat/clear dialog. */
export function ReturnCallDone(p:{time:string;by?:string;disabled?:boolean;onClick:()=>void}){return <CallDone side="out" {...p}/>}
/** Arrival (Anreise) call already recorded: green twin of ReturnCallDone. */
export function ArrivalCallDone(p:{time:string;by?:string;disabled?:boolean;onClick:()=>void}){return <CallDone side="in" {...p}/>}
/** Small second line naming the staff member who did a step. */
export function ByLine({name,inline}:{name?:string;inline?:boolean}){return !name?null:inline?<span className="op-by inline">{" · "}{tr("von ")}<bdi>{name}</bdi></span>:<small className="op-by">{tr("von ")}<bdi>{name}</bdi></small>}

export interface BookingDetailViewProps{
  booking:Booking;
  gefahrenAccount?:string;
  onGefahren?:(value:1|2|3|4|null)=>Promise<void>;
  /** Product label resolved from the actual products catalog, never guessed from the code. */
  productLabel?:string;
  /** actual stored operations for this booking, if any */
  ops?:BookingOperations;
  /** booking exists in the database (actions need it) */
  known:boolean;
  contactCounts?:{phone:number;email:number};
  busy?:boolean;
  opsBusy?:string;
  opsErr?:string;
  opsLoadErr?:string;
  demo?:boolean;
  driverName?:string;
  /** return driver (red Rückgabe column); undefined = none */
  returnDriverName?:string;
  /** FlightHead elements built by the caller (preserves existing live behaviour) */
  flightIn:React.ReactNode;
  flightOut:React.ReactNode;
  onBack:()=>void;
  onEdit:()=>void;
  onStartCheck:(k:'in'|'out')=>void;
  onAction:(a:BookingOperationAction)=>void;
  /** opens the pickup-undo dialog; only offered for an already-marked taken_away (long press or visible button) */
  onPickupUndo?:()=>void;
  /** existing secure UndoControls element, rendered unchanged */
  undoSlot?:React.ReactNode;
  /** MediaGallery element; caller passes the upload label as its addTile prop so + is the FIRST tile in the grid */
  mediaGallery?:React.ReactNode;
  /** fallback only when no gallery element is given */
  mediaAdd?:React.ReactNode;
  /** Has called button + live counter supplied by the caller (audited customer_called_at; repeat needs confirmation). Rendered full width under the columns. */
  calledSlot?:React.ReactNode;
  /** Return-phase call button (calls recorded after check-in), shown in the red column. */
  calledOutSlot?:React.ReactNode;
  /** Return call time (call recorded at/after check-in). Until set, the red panel offers only "Hat angerufen". */
  returnCalledAt?:string|null;
  /** open the driver picker (green "Keinem Fahrer zugewiesen"); falls back to onEdit when absent */
  onAssignDriver?:()=>void;
  /** open the return-driver picker (red column) */
  onAssignReturnDriver?:()=>void;
  /** payment UI (caller-supplied, e.g. booking-payment-view) rendered under the cost overview */
  paymentSlot?:React.ReactNode;
  /** show raw import provenance (admins) */
  admin?:boolean;
  /** names of staff who did each completed step (from stored actor ids) */
  actors?:Attribution;
}

export const NO_COMMENTS="There are no comments";
export const OCR_NOTE="Odometer scan is not available yet (no OCR).";
export function parkingDays(b:Pick<Booking,'arrival_at'|'departure_at'>){return Math.max(1,Math.ceil((Date.parse(b.departure_at)-Date.parse(b.arrival_at))/864e5))}
export function personsLabel(n:number){return n>0?n+(n===1?tr(" person"):tr(" persons")):tr("Add number of persons")}
/** Service is only known for "-V-" products (valet). Nothing else is invented. */
export function serviceInfo(b:Pick<Booking,'product'|'covered'>,location:string){
  const valet=/-V-/i.test(b.product||'');
  return {service:valet?'Valet':'',physical:b.covered?'COVERED':'OPEN',product:b.product||'',location:location||b.product||''};
}
export function detailMoney(n:number){
  const lang=getLanguage();
  return lang==='en'?new Intl.NumberFormat('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+'€':new Intl.NumberFormat(lang==='ar'?'ar-EG':'de-DE',{style:'currency',currency:'EUR'}).format(n);
}
const dateLong=(v:string)=>new Date(v).toLocaleDateString(getLanguage()==='ar'?'ar-EG':getLanguage()==='de'?'de-DE':'en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Berlin'}).replace(',','');

export function BookingDetailView(p:BookingDetailViewProps){
  const[printError,setPrintError]=useState('');
  const b=p.booking,o=p.ops,due=Math.max(0,Math.round(b.total*100)-Math.round(b.paid*100))/100,c=displayComment(b.comment,true),pn=paymentInstruction(b),info=serviceInfo(b,c.location);
  const hold=useHold({onHold:()=>p.onPickupUndo?.(),enabled:!!p.onPickupUndo});
  const act=(a:BookingOperationAction,label:string,at:string|null|undefined,cls:string)=>{
    const key=b.id+':'+a;
    const undoable=a==='taken_away'&&!!at&&!!p.onPickupUndo&&p.known&&!p.opsBusy&&b.status==='confirmed'&&!!b.checked_in_at;
    if(undoable)return <span className="pickup-hold" {...hold}><button type="button" className={'op-btn '+cls} aria-disabled="true" aria-describedby="pickup-hold-hint" onClick={e=>e.preventDefault()}><Check size={16}/> <span>{label}</span><small className="op-at">{stamp(at)}<ByLine inline name={p.actors?.[a]}/></small></button><PickupMenuButton onClick={()=>p.onPickupUndo?.()}/><span id="pickup-hold-hint" className="sr-only">{tr("Lange drücken, um die Abholung rückgängig zu machen.")}</span></span>;
    return <button type="button" className={'op-btn '+cls} aria-busy={p.opsBusy===key} disabled={!!p.opsBusy||!!at||!p.known||b.status!=='confirmed'||!!b.checked_out_at||(a!=='customer_called'&&!b.checked_in_at)} onClick={()=>p.onAction(a)}>{at?<><Check size={16}/> <span>{label}</span><small className="op-at">{stamp(at)}<ByLine inline name={a==='taken_away'||a==='retrieved'?p.actors?.[a]:undefined}/></small></>:p.opsBusy===key?tr("Wird gespeichert …"):label}</button>;
  };
  return <div className="bd">
    <header className="bd-head"><button type="button" aria-label={tr("Schließen")} className="bd-round" onClick={p.onBack}><ChevronLeft/></button><h2>{tr("Booking #")}<bdi>{b.code}</bdi></h2><button type="button" aria-label={tr("Bearbeiten")} className="bd-round" onClick={p.onEdit}><svg className="reference-gear" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M9.5 1.5h5l.7 3a8 8 0 0 1 1.4.8l3-.9 2.5 4.3-2.3 2.1a8 8 0 0 1 0 1.6l2.3 2.1-2.5 4.3-3-.9a8 8 0 0 1-1.4.8l-.7 3h-5l-.7-3a8 8 0 0 1-1.4-.8l-3 .9-2.5-4.3 2.3-2.1a8 8 0 0 1 0-1.6L1.9 8.7l2.5-4.3 3 .9a8 8 0 0 1 1.4-.8l.7-3ZM12 7.8a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4Z"/></svg></button></header>
    {b.external_id?.trim()&&<div className="pp-strip ext">{tr("External ID:")}<bdi>{b.external_id}</bdi></div>}
    {pn&&<div className="bd-pay-note" role="alert"><Banknote size={18}/>{pn}</div>}
    {due>0&&<div className="pp-strip due bd-sticky" role="status"><Fa name="money-bill-1-regular" size={17}/> {tr("Outstanding amount:")}{' '}<b>{money(due)}</b></div>}
    <section className="bd-identity">
      <div><span className="bd-label">{tr("Name")}</span><strong>{b.customer_name}</strong>
        {!b.phone&&<button type="button" className="pp-link bd-add-phone" onClick={p.onEdit}>{tr("Add phone number")}</button>}
        {b.phone&&<span className="bd-contact"><a href={'tel:'+b.phone}><bdi>{b.phone}</bdi></a>{p.contactCounts&&<span className="bd-contact-count">({p.contactCounts.phone})</span>}</span>}
        {b.email&&<span className="bd-contact"><a href={'mailto:'+b.email}><bdi>{b.email}</bdi></a>{p.contactCounts&&<span className="bd-contact-count">({p.contactCounts.email})</span>}</span>}
        <button type="button" className="pp-link" onClick={p.onEdit}>{personsLabel(b.persons)}</button></div>
      <div><span className="bd-label">{tr("Car")}</span><strong dir="ltr">{b.plate}</strong>
        {b.checked_in_at&&<span className="pp-check" aria-label={tr("Eingecheckt")}><Check size={15}/></span>}
        {c.vehicle&&<span className="bd-vehicle">{c.vehicle}</span>}
        <span className="bd-key"><KeyRound size={13}/> <bdi>{b.key_cash||'–'}</bdi></span>
        <button type="button" className="bd-outline" onClick={p.onEdit}><Fa name="plus" size={11}/>{tr("+ KM and comment").replace(/^\+\s*/,"")}</button>
        <OdometerCapture key={b.id} onEdit={p.onEdit}/></div>
    </section>
    <div className="split-handover">{(['in','out'] as const).map(k=>{const at=k==='in'?b.checked_in_at:b.checked_out_at,when=k==='in'?b.arrival_at:b.departure_at;return <section className={k} key={k}>
      <h3><ReferenceIcon name="car" size={18}/>{k==='in'?tr("PARKING DATE"):tr("RETURN DATE")}</h3>
      <div className="handover-date"><strong>{dateLong(when)}</strong><strong>{clock(when)}</strong><span>{tr("Mileage:")}{' '}{b.km==null?"–":b.km}</span>
        <button type="button" className={at&&p.actors?.[k]?'has-by':undefined} disabled={!!p.busy||!!at||b.status!=='confirmed'} onClick={()=>p.onStartCheck(k)}>{at?<><Check size={17}/> {k==='in'?tr('Checked-in:'):tr('Checked-out:')} {clock(at)}<ByLine name={p.actors?.[k]}/></>:<>{<ReferenceIcon name={k==='in'?'checkin':'checkout'} size={15}/>} {k==='in'?tr('Check-in'):tr('Check-out')}</>}</button></div>
      <div className={'flight-panel '+k}>{k==='in'?p.flightIn:p.flightOut}
        <div className="fp-actions">{k==='in'?<>{p.calledSlot}
        <button type="button" className="fp-driver" aria-haspopup="dialog" onClick={p.onAssignDriver??p.onEdit}>{p.driverName||tr("Not assigned to driver")}</button></>
        :returnNeedsCall({returnCalledAt:p.returnCalledAt,takenAwayAt:o?.taken_away_at,retrievedAt:o?.retrieved_at,checkedOutAt:b.checked_out_at})?<>{p.calledOutSlot}</>:<>{p.calledOutSlot}{act('taken_away',tr("Mark as taken away"),o?.taken_away_at,'fp-act')}</>}
        {k==='out'&&p.onAssignReturnDriver&&<button type="button" className="fp-driver fp-return-driver" aria-haspopup="dialog" onClick={p.onAssignReturnDriver}>{p.returnDriverName||tr("Not assigned to return driver")}</button>}</div></div>
    </section>})}</div>
    <section className="pp-called" aria-label={tr("Kundenanruf")}>
      {p.opsErr&&<p className="error" role="alert">{p.opsErr}</p>}
      {p.opsLoadErr&&!p.demo&&<small role="status">{tr("Ablauf konnte nicht geladen werden:")}{p.opsLoadErr}</small>}
      {p.demo&&<small>{tr("Demo, nur lokal")}</small>}</section>
    {p.undoSlot}
    <div className="bd-print bd-print-gefahren"><GefahrenButton key={(p.gefahrenAccount??'')+':'+b.id} value={b.gefahren??null} disabled={!p.known||!!p.busy||!!p.demo||!p.onGefahren} onSave={p.onGefahren}/><PrintSheetsButton items={[{b}]} date={day(b.arrival_at)} detail onDone={()=>setPrintError('')} onError={setPrintError}/>{printError&&<p role="alert" className="error">{printError}</p>}</div>
    <section className="summary-cost"><h3><ReferenceIcon name="calculator" size={14}/>{tr("Cost overview")}</h3>
      <p><span>{getLanguage()==='ar'?tr("Parking ("):"Parken ("}{p.productLabel||b.product||b.platform}{")"}<small className="bd-days"> · {parkingDays(b)} {tr("days")}</small></span><span>{detailMoney(b.total)}</span></p>
      <p className="bd-cost-total"><span>{tr("Total amount")}</span><span>{detailMoney(b.total)}</span></p>
      <p className="bd-cost-total"><span>{b.offline_pending?tr("Lokal vorgemerkt"):tr("Paid")}</span><span>{detailMoney(b.paid)}</span></p>
      <p className={"bd-due"+(due>0?" is-due":"")}><strong>{b.offline_pending?tr("Restbetrag nach Vormerkung"):tr("Total due payable")}</strong><strong>{detailMoney(due)}</strong></p>{p.paymentSlot}</section>
    <div className="summary-location bd-service pp-svc"><span className="bd-svc-cell"><span className="bd-svc-line"><span className="bd-svc-ico"><Fa name="car-side" size={18}/><Fa name="person" size={14}/></span>{info.service&&<b>{tr("Valet")}</b>}</span><small>{tr(b.covered?"COVERED":"OPEN")}</small></span><span className="bd-product"><i className={'bd-product-dot pp-dot-'+(partnerBadge(b)?.cls||'none')} aria-hidden="true"/><span>{p.productLabel||info.product}</span></span><span className="bd-loc">{info.location&&info.location!==info.product?info.location:''}</span></div>
    <section className="summary-media"><h3><Fa name="camera" size={18}/>  {tr("Media")}</h3><div className="detail-media bd-media">{p.mediaGallery??p.mediaAdd}</div></section>
    <section className="summary-media bd-comments"><h3><Fa name="comment" size={18}/>  {tr("Comments")}</h3>
      <button type="button" className="add-comment" aria-label={tr("Kommentar hinzufügen")} onClick={p.onEdit}><Fa name="plus" size={26}/></button>
      <p className={c.text?undefined:"bd-no-comments"}>{c.text||tr("There are no comments")}</p>
      {p.admin&&c.imported&&<details className="provenance"><summary>{tr("Importquelle")}</summary><p>{tr("ParkingPro-Import")}</p>{c.vehicle&&<p>{tr("Fahrzeug ·")}{c.vehicle}</p>}{c.location&&<p>{tr("Standort ·")}{c.location}</p>}</details>}</section>
  </div>;
}
export default BookingDetailView;
