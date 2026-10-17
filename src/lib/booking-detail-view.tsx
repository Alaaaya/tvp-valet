import React from 'react';
import {Banknote,Camera,Car,Check,ChevronLeft,KeyRound,MessageSquare,Plus,ScanLine,Settings} from 'lucide-react';
import {clock,money,stamp,type Booking} from '../model';
import {displayComment} from './comments';
import type {BookingOperations,BookingOperationAction} from './operations';
import '../booking-detail.css';

export interface BookingDetailViewProps{
  booking:Booking;
  /** actual stored operations for this booking, if any */
  ops?:BookingOperations;
  /** booking exists in the database (actions need it) */
  known:boolean;
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
  /** show raw import provenance (admins) */
  admin?:boolean;
}

export const NO_COMMENTS='There are no comments';
export const OCR_NOTE='Odometer scan is not available yet (no OCR).';
export function parkingDays(b:Pick<Booking,'arrival_at'|'departure_at'>){return Math.max(1,Math.ceil((Date.parse(b.departure_at)-Date.parse(b.arrival_at))/864e5))}
export function personsLabel(n:number){return n>0?n+(n===1?' person':' persons'):'Add number of persons'}
/** Service is only known for "-V-" products (valet). Nothing else is invented. */
export function serviceInfo(b:Pick<Booking,'product'|'covered'>,location:string){
  const valet=/-V-/i.test(b.product||'');
  return {service:valet?'Valet':'',physical:b.covered?'COVERED':'OPEN',product:b.product||'',location:location||b.product||''};
}
const dateLong=(v:string)=>new Date(v).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Berlin'}).replace(',','');

export function BookingDetailView(p:BookingDetailViewProps){
  const b=p.booking,o=p.ops,due=Math.max(0,b.total-b.paid),c=displayComment(b.comment),info=serviceInfo(b,c.location);
  const act=(a:BookingOperationAction,label:string,at:string|null|undefined,cls:string)=>{
    const key=b.id+':'+a;
    return <button type="button" className={'op-btn '+cls} aria-busy={p.opsBusy===key} disabled={!!p.opsBusy||!!at||!p.known||b.status!=='confirmed'||!!b.checked_out_at||(a!=='customer_called'&&!b.checked_in_at)} onClick={()=>p.onAction(a)}>{at?<><Check size={16}/> {label} · {stamp(at)}</>:p.opsBusy===key?'Wird gespeichert …':label}</button>;
  };
  return <div className="bd">
    <header className="bd-head"><button type="button" aria-label="Schließen" className="bd-round" onClick={p.onBack}><ChevronLeft/></button><h2>Booking #{b.code}</h2><button type="button" aria-label="Bearbeiten" className="bd-round" onClick={p.onEdit}><Settings size={21}/></button></header>
    <div className="pp-strip ext">External ID: {b.external_id||b.code}</div>
    {due>0&&<div className="pp-strip due"><Banknote size={16}/> Outstanding amount: {money(due)}</div>}
    <section className="bd-identity">
      <div><span className="bd-label">Name</span><strong>{b.customer_name}</strong>
        {b.phone&&<a href={'tel:'+b.phone}>{b.phone}</a>}
        {b.email&&<a href={'mailto:'+b.email}>{b.email}</a>}
        <button type="button" className="pp-link" onClick={p.onEdit}>{personsLabel(b.persons)}</button></div>
      <div><span className="bd-label">Car</span><strong>{b.plate}</strong>
        {b.checked_in_at&&<span className="pp-check" aria-label="Eingecheckt"><Check size={15}/></span>}
        <span className="bd-key"><KeyRound size={13}/> {b.key_cash||'–'}</span>
        <button type="button" className="bd-outline" onClick={p.onEdit}>+ KM and comment</button>
        <button type="button" className="bd-outline" disabled aria-describedby={'ocr-'+b.id}><ScanLine size={14}/> Scan odometer</button>
        <small id={'ocr-'+b.id}>{OCR_NOTE}</small></div>
    </section>
    <div className="split-handover">{(['in','out'] as const).map(k=>{const at=k==='in'?b.checked_in_at:b.checked_out_at,when=k==='in'?b.arrival_at:b.departure_at;return <section className={k} key={k}>
      <h3><Car size={17}/>{k==='in'?'PARKING DATE':'RETURN DATE'}</h3>
      <div className="handover-date"><strong>{dateLong(when)}</strong><strong>{clock(when)}</strong><span>Mileage: {b.km==null?"–":b.km}</span>
        <button type="button" disabled={!!p.busy||!!at||b.status!=='confirmed'} onClick={()=>p.onStartCheck(k)}>{at?<><Check size={15}/> {k==='in'?'Checked-in:':'Checked-out:'} {clock(at)}</>:k==='in'?'Check-in':'Check-out'}</button></div>
      <div className={'flight-panel '+k}>{k==='in'?p.flightIn:p.flightOut}
        {k==='in'?act('taken_away','Mark as taken away',o?.taken_away_at,'fp-act'):act('retrieved','Mark as retrieved',o?.retrieved_at,'fp-act')}
        {k==='in'?<button type="button" className="fp-driver" onClick={p.onEdit}>{p.driverName||'Not assigned to driver'}</button>:act('customer_called','Has called',o?.customer_called_at,'fp-act')}</div>
    </section>})}</div>
    <section className="pp-ride" aria-label="Ablauf">{act('ride_started','Start ride',o?.ride_started_at,'ride')}
      {!b.checked_in_at&&b.status==='confirmed'&&<small>Abholen und Fahrt starten erst nach dem Check-in.</small>}
      {p.opsErr&&<p className="error" role="alert">{p.opsErr}</p>}
      {p.opsLoadErr&&!p.demo&&<small role="status">Ablauf konnte nicht geladen werden: {p.opsLoadErr}</small>}
      {p.demo&&<small>Demo, nur lokal</small>}</section>
    {p.undoSlot}
    <section className="summary-cost"><h3>Cost overview</h3>
      <p><span>Parking ({b.product||b.platform})<small className="bd-days">{parkingDays(b)} days</small></span><span>{money(b.total)}</span></p>
      <p><span>Total amount</span><span>{money(b.total)}</span></p>
      <p><span>Paid</span><span>{money(b.paid)}</span></p>
      <p><strong>Total due payable</strong><strong>{money(due)}</strong></p></section>
    <div className="summary-location bd-service"><Car size={18}/><span>{info.service&&<b>{info.service}</b>}<small>{info.physical}</small></span><span className="bd-product">{info.product}</span>{info.location&&info.location!==info.product&&<span className="bd-loc">{info.location}</span>}</div>
    <section className="summary-media"><h3><Camera size={18}/> Media</h3><div className="detail-media bd-media">{p.mediaGallery??p.mediaAdd}</div></section>
    <section className="summary-media bd-comments"><h3><MessageSquare size={18}/> Comments</h3>
      <button type="button" className="add-comment" aria-label="Kommentar hinzufügen" onClick={p.onEdit}><Plus/></button>
      <p>{c.text||NO_COMMENTS}</p>
      {p.admin&&c.imported&&<details className="provenance"><summary>Importquelle</summary><p>ParkingPro-Import</p>{c.vehicle&&<p>Fahrzeug · {c.vehicle}</p>}{c.location&&<p>Standort · {c.location}</p>}</details>}</section>
  </div>;
}
export default BookingDetailView;
