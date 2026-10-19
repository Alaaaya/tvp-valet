import {t as tr} from './i18n';
import React,{useRef} from 'react';
import {useEdgeBack} from './use-edge-back';
import type {Booking} from '../model';
import {BLOCKING_LABELS,type BlockingKey} from './booking-filters';
import type {ScanOutcome} from './scan-lookup';
export interface ScanResultProps{outcome:ScanOutcome;onPick:(b:Booking)=>void;onJump:(date:string)=>void;onRelax?:(keys:BlockingKey[])=>void;onClose:()=>void}
const dmy=(d:string)=>d.split('-').reverse().join('.');
/** Explains a scan lookup. Jumping to another date is always an explicit tap; filters are never changed here. */
export function ScanResult({outcome,onPick,onJump,onRelax,onClose}:ScanResultProps){
 const row=(b:Booking)=><button type="button" key={b.id} className="outline" onClick={()=>onPick(b)}>{b.plate||'–'} {"·"}{b.customer_name} {"· #"}{b.code}</button>;
 const root=useRef<HTMLDivElement>(null);
 useEdgeBack(root,{enabled:true,priority:50,onBack:()=>{onClose()}});
 return <div ref={root} className="call-confirm scan-result" role="alertdialog" aria-label={tr("Scan-Ergebnis")}>
  {outcome.status==='ambiguous'&&<><p>{tr("Mehrere Treffer. Bitte Buchung wählen.")}</p>{outcome.bookings.map(row)}</>}
  {outcome.status==='outside'&&<><p>{outcome.filteredAfterJump?tr("Datum gewechselt. Diese Buchung wird weiterhin durch die aktiven Filter ausgeblendet. Es wurde kein Filter automatisch geändert."):tr("Keine Übereinstimmung in der aktuellen Liste.")} {outcome.bookings.length===1?tr("Die Buchung ")+outcome.bookings[0].plate+' (#'+outcome.bookings[0].code+tr(") liegt außerhalb von Datum oder Filter."):outcome.bookings.length+tr(" Buchungen liegen außerhalb von Datum oder Filter.")}</p>{outcome.filteredAfterJump&&!!outcome.blocking?.length&&onRelax&&<button type="button" className="primary" onClick={()=>onRelax(outcome.blocking as BlockingKey[])}>{tr("Filter ausschalten:")} {outcome.blocking.map(k=>tr(BLOCKING_LABELS[k as BlockingKey] as import("./i18n").TranslationKey)).join(', ')}</button>}{outcome.jumpDate&&<button type="button" className="primary" onClick={()=>onJump(outcome.jumpDate!)}>{tr("Zum")}{' '}{dmy(outcome.jumpDate)} {tr("springen")}</button>}{outcome.bookings.length>1&&outcome.bookings.map(row)}</>}
  {outcome.status==='unknown'&&<p>{tr("Keine Buchung mit diesem Kennzeichen oder Code gefunden.")}</p>}
  <button type="button" className="outline" onClick={onClose}>{tr("Schließen")}</button>
 </div>;
}
