import React from 'react';
import type {Booking} from '../model';
import {BLOCKING_LABELS,type BlockingKey} from './booking-filters';
import type {ScanOutcome} from './scan-lookup';
export interface ScanResultProps{outcome:ScanOutcome;onPick:(b:Booking)=>void;onJump:(date:string)=>void;onRelax?:(keys:BlockingKey[])=>void;onClose:()=>void}
const dmy=(d:string)=>d.split('-').reverse().join('.');
/** Explains a scan lookup. Jumping to another date is always an explicit tap; filters are never changed here. */
export function ScanResult({outcome,onPick,onJump,onRelax,onClose}:ScanResultProps){
 const row=(b:Booking)=><button type="button" key={b.id} className="outline" onClick={()=>onPick(b)}>{b.plate||'–'} · {b.customer_name} · #{b.code}</button>;
 return <div className="call-confirm scan-result" role="alertdialog" aria-label="Scan-Ergebnis">
  {outcome.status==='ambiguous'&&<><p>Mehrere Treffer. Bitte Buchung wählen.</p>{outcome.bookings.map(row)}</>}
  {outcome.status==='outside'&&<><p>{outcome.filteredAfterJump?'Datum gewechselt. Diese Buchung wird weiterhin durch die aktiven Filter ausgeblendet. Es wurde kein Filter automatisch geändert.':'Keine Übereinstimmung in der aktuellen Liste.'} {outcome.bookings.length===1?'Die Buchung '+outcome.bookings[0].plate+' (#'+outcome.bookings[0].code+') liegt außerhalb von Datum oder Filter.':outcome.bookings.length+' Buchungen liegen außerhalb von Datum oder Filter.'}</p>{outcome.filteredAfterJump&&!!outcome.blocking?.length&&onRelax&&<button type="button" className="primary" onClick={()=>onRelax(outcome.blocking as BlockingKey[])}>Filter ausschalten: {outcome.blocking.map(k=>BLOCKING_LABELS[k as BlockingKey]||k).join(', ')}</button>}{outcome.jumpDate&&<button type="button" className="primary" onClick={()=>onJump(outcome.jumpDate!)}>Zum {dmy(outcome.jumpDate)} springen</button>}{outcome.bookings.length>1&&outcome.bookings.map(row)}</>}
  {outcome.status==='unknown'&&<p>Keine Buchung mit diesem Kennzeichen oder Code gefunden.</p>}
  <button type="button" className="outline" onClick={onClose}>Schließen</button>
 </div>;
}
