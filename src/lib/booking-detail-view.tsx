import {t as tr,getLanguage} from './i18n';
import React from 'react';
import {ReferenceIcon} from './reference-icon';
import {OdometerCapture} from './odometer-capture';
import {Banknote,Camera,Car,Check,ChevronLeft,KeyRound,MessageSquare,Plus,ParkingSquare} from 'lucide-react';
import {clock,money,stamp,type Booking} from '../model';
import {displayComment} from './comments';
import {paymentInstruction} from './payment-note';
import '../payment-note.css';
import type {BookingOperations,BookingOperationAction} from './operations';
import '../booking-detail.css';

export interface BookingDetailViewProps{
  booking:Booking;
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
  /** FlightHead elements built by the caller (preserves existing live behaviour) */
  flightIn:React.ReactNode;
  flightOut:React.ReactNode;
  onBack:()=>void;
  onEdit:()=>void;
  onStartCheck:(k:'in'|'out')=>void;
  onAction:(a:BookingOperationAction)=>void;
  /** existing secure UndoControls element, rendered unchanged */
  undoSlot?:React.ReactNode;
  /** MediaGallery element; caller passes the upload label as its addTile prop so + is the FIRST tile in the grid */
  mediaGallery?:React.ReactNode;
  /** fallback only when no gallery element is given */
  mediaAdd?:React.ReactNode;
  /** Has called button + live counter supplied by the caller (audited customer_called_at; repeat needs confirmation). Rendered full width under the columns. */
  calledSlot?:React.ReactNode;
  /** payment UI (caller-supplied, e.g. booking-payment-view) rendered under the cost overview */
  paymentSlot?:React.ReactNode;
  /** show raw import provenance (admins) */
  admin?:boolean;
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
  const b=p.booking,o=p.ops,due=Math.max(0,Math.round(b.total*100)-Math.round(b.paid*100))/100,c=displayComment(b.comment,true),pn=paymentInstruction(b),info=serviceInfo(b,c.location);
  const act=(a:BookingOperationAction,label:string,at:string|null|undefined,cls:string)=>{
    const key=b.id+':'+a;
    return <button type="button" className={'op-btn '+cls} aria-busy={p.opsBusy===key} disabled={!!p.opsBusy||!!at||!p.known||b.status!=='confirmed'||!!b.checked_out_at||(a!=='customer_called'&&!b.checked_in_at)} onClick={()=>p.onAction(a)}>{at?<><Check size={16}/> {label} {"·"}{' '}{stamp(at)}</>:p.opsBusy===key?tr("Wird gespeichert …"):label}</button>;
  };
  return <div className="bd">
    <header className="bd-head"><button type="button" aria-label={tr("Schließen")} className="bd-round" onClick={p.onBack}><ChevronLeft/></button><h2>{tr("Booking #")}<bdi>{b.code}</bdi></h2><button type="button" aria-label={tr("Bearbeiten")} className="bd-round" onClick={p.onEdit}><svg className="reference-gear" viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" d="M9.5 1.5h5l.7 3a8 8 0 0 1 1.4.8l3-.9 2.5 4.3-2.3 2.1a8 8 0 0 1 0 1.6l2.3 2.1-2.5 4.3-3-.9a8 8 0 0 1-1.4.8l-.7 3h-5l-.7-3a8 8 0 0 1-1.4-.8l-3 .9-2.5-4.3 2.3-2.1a8 8 0 0 1 0-1.6L1.9 8.7l2.5-4.3 3 .9a8 8 0 0 1 1.4-.8l.7-3ZM12 7.8a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4Z"/></svg></button></header>
    {b.external_id?.trim()&&<div className="pp-strip ext">{tr("External ID:")}<bdi>{b.external_id}</bdi></div>}
    {pn&&<div className="bd-pay-note" role="alert"><Banknote size={18}/>{pn}</div>}
    {due>0&&<div className="pp-strip due bd-sticky" role="status"><Banknote size={16}/> {tr("Outstanding amount:")}{' '}{money(due)}</div>}
    <section className="bd-identity">
      <div><span className="bd-label">{tr("Name")}</span><strong>{b.customer_name}</strong>
        {!b.phone&&<button type="button" className="pp-link bd-add-phone" onClick={p.onEdit}>{tr("Add phone number")}</button>}
        {b.phone&&<span className="bd-contact"><a href={'tel:'+b.phone}><bdi>{b.phone}</bdi></a>{p.contactCounts&&<span className="bd-contact-count">({p.contactCounts.phone})</span>}</span>}
        {b.email&&<span className="bd-contact"><a href={'mailto:'+b.email}><bdi>{b.email}</bdi></a>{p.contactCounts&&<span className="bd-contact-count">({p.contactCounts.email})</span>}</span>}
        <button type="button" className="pp-link" onClick={p.onEdit}>{personsLabel(b.persons)}</button></div>
      <div><span className="bd-label">{tr("Car")}</span><strong dir="ltr">{b.plate}</strong>
        {b.checked_in_at&&<span className="pp-check" aria-label={tr("Eingecheckt")}><Check size={15}/></span>}
        {c.vehicle&&<span className="bd-vehicle">{c.vehicle}</span>}
        <span className="bd-location"><bdi>{b.spot||c.location||"–"}</bdi><ParkingSquare size={16}/></span>
        <span className="bd-key"><KeyRound size={13}/> <bdi>{b.key_cash||'–'}</bdi></span>
        <button type="button" className="bd-outline" onClick={p.onEdit}><Plus size={15}/>{tr("+ KM and comment").replace(/^\+\s*/,"")}</button>
        <OdometerCapture key={b.id} onEdit={p.onEdit}/></div>
    </section>
    <div className="split-handover">{(['in','out'] as const).map(k=>{const at=k==='in'?b.checked_in_at:b.checked_out_at,when=k==='in'?b.arrival_at:b.departure_at;return <section className={k} key={k}>
      <h3><ReferenceIcon name="car" size={18}/>{k==='in'?tr("PARKING DATE"):tr("RETURN DATE")}</h3>
      <div className="handover-date"><strong>{dateLong(when)}</strong><strong>{clock(when)}</strong><span>{tr("Mileage:")}{' '}{b.km==null?"–":b.km}</span>
        <button type="button" disabled={!!p.busy||!!at||b.status!=='confirmed'} onClick={()=>p.onStartCheck(k)}>{at?<><Check size={17}/> {k==='in'?tr('Checked-in:'):tr('Checked-out:')} {clock(at)}</>:<>{<ReferenceIcon name={k==='in'?'checkin':'checkout'} size={15}/>} {k==='in'?tr('Check-in'):tr('Check-out')}</>}</button></div>
      <div className={'flight-panel '+k}>{k==='in'?p.flightIn:p.flightOut}
        {!b.checked_in_at&&!b.checked_out_at?p.calledSlot:k==='in'?act('taken_away',tr("Mark as taken away"),o?.taken_away_at,'fp-act'):null}
        {b.checked_in_at&&k==='out'&&act('retrieved',tr("Mark as retrieved"),o?.retrieved_at,'fp-act')}
        {k==='in'&&b.checked_in_at&&<button type="button" className="fp-driver" onClick={p.onEdit}>{p.driverName||tr("Not assigned to driver")}</button>}</div>
    </section>})}</div>
    <section className="pp-called" aria-label={tr("Kundenanruf")}>{b.checked_in_at&&p.calledSlot}
      {p.opsErr&&<p className="error" role="alert">{p.opsErr}</p>}
      {p.opsLoadErr&&!p.demo&&<small role="status">{tr("Ablauf konnte nicht geladen werden:")}{p.opsLoadErr}</small>}
      {p.demo&&<small>{tr("Demo, nur lokal")}</small>}</section>
    {p.undoSlot}
    <section className="summary-cost"><h3><ReferenceIcon name="calculator" size={14}/>{tr("Cost overview")}</h3>
      <p><span>{getLanguage()==='ar'?tr("Parking ("):"Parken ("}{p.productLabel||b.product||b.platform}{")"}<small className="bd-days"> · {parkingDays(b)} {tr("days")}</small></span><span>{detailMoney(b.total)}</span></p>
      <p className="bd-cost-total"><span>{tr("Total amount")}</span><span>{detailMoney(b.total)}</span></p>
      <p className="bd-cost-total"><span>{tr("Paid")}</span><span>{detailMoney(b.paid)}</span></p>
      <p><strong>{tr("Total due payable")}</strong><strong>{detailMoney(due)}</strong></p>{p.paymentSlot}</section>
    <div className="summary-location bd-service"><Car size={18}/><span>{info.service&&<b>{tr("Valet")}</b>}<small>{tr(b.covered?"COVERED":"OPEN")}</small></span><span className="bd-product"><i className="bd-product-dot" aria-hidden="true"/>{info.product}</span>{info.location&&info.location!==info.product&&<span className="bd-loc">{info.location}</span>}</div>
    <section className="summary-media"><h3><Camera size={18}/>  {tr("Media")}</h3><div className="detail-media bd-media">{p.mediaGallery??p.mediaAdd}</div></section>
    <section className="summary-media bd-comments"><h3><MessageSquare size={18}/>  {tr("Comments")}</h3>
      <button type="button" className="add-comment" aria-label={tr("Kommentar hinzufügen")} onClick={p.onEdit}><Plus/></button>
      <p>{c.text||tr("There are no comments")}</p>
      {p.admin&&c.imported&&<details className="provenance"><summary>{tr("Importquelle")}</summary><p>{tr("ParkingPro-Import")}</p>{c.vehicle&&<p>{tr("Fahrzeug ·")}{c.vehicle}</p>}{c.location&&<p>{tr("Standort ·")}{c.location}</p>}</details>}</section>
  </div>;
}
export default BookingDetailView;
