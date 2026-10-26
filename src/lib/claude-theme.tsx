import React from 'react';
import {Check,Phone,UserRound} from 'lucide-react';
import {t as tr} from './i18n';
import {money,clock} from '../model';
import {partnerBadge,rowComment,moneyState,type BookingListRowProps} from './booking-list-row';

import {ClaudeGlyph} from './claude-icons';
export {ClaudeGlyph} from './claude-icons';
export function ClaudeTitle({date,today,lang,heading,onDate}:{date:string;today:string;lang:string;heading:string;onDate:(value:string)=>void}){
 const d=new Date(date+'T12:00:00Z'),next=new Date(today+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
 const title=date===today?tr('Heute'):date===next.toISOString().slice(0,10)?(lang==='de'?'Morgen':lang==='ar'?'بكرا':'Tomorrow'):new Intl.DateTimeFormat(lang,{weekday:'long',timeZone:'UTC'}).format(d);
 const dateText=lang==='en'?new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(d).replace(',',''):new Intl.DateTimeFormat(lang,{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(d);
 return <span className="cl-title"><strong>{title}</strong><small>{heading} · <label className="cl-date">{dateText}<input type="date" aria-label={tr('Datum')} value={date} onChange={e=>e.target.value&&onDate(e.target.value)}/></label></small></span>;
}
/** Explicit presentation overrides for isolated synthetic reference stories only.
 * The production booking list never supplies this prop or invents a processor. */
export interface ClaudeReferencePresentation {paymentLabel:string;referenceLabel?:string}
export function ClaudeRow({b,kind,time,completed,onOpen,commentCount,callCounterSlot,callClearSlot,returnDriverName,referencePresentation}:BookingListRowProps&{referencePresentation?:ClaudeReferencePresentation}){
 const badge=partnerBadge(b),flight=kind==='in'?b.flight_in:b.flight_out,actual=kind==='in'?b.actual_flight_in:b.actual_flight_out;
 const m=moneyState(b),note=rowComment(b);
 const comments=commentCount??0;
 const payment=referencePresentation?.paymentLabel??(m.kind==='none'?'':money(m.kind==='due'?Math.max(0,b.total-b.paid):b.paid));
 return <article className={'cl-row '+kind+(completed?' done':'')+((note||b.key_cash)?' with-note':'')+(callClearSlot?' has-call-clear':'')}>
 <button type="button" className="cl-main blr-main" onClick={()=>onOpen(b)} aria-label={(kind==='in'?tr('Annahme '):tr('Rückgabe '))+time+' '+b.plate+' '+b.customer_name}>
 <span className="cl-time"><ClaudeGlyph name={kind==='in'?'in':'out'} size={27} className="cl-arrow"/><strong>{time}</strong>{completed&&<Check className="cl-check" size={13} aria-label={tr('erledigt')}/>}
 {flight?<span className="cl-flight"><ClaudeGlyph name="flight" size={16} className="cl-plane"/>{flight}{actual&&Number.isFinite(Date.parse(actual))?<b>{clock(actual)}</b>:null}</span>:b.covered?<span className="cl-covered">COVERED</span>:null}</span>
 <span className="cl-content">
 <span className="cl-line cl-first"><strong className="cl-plate">{b.plate||'–'}</strong><span className="cl-tags">{badge&&<em className={'cl-badge '+badge.cls}>{badge.product||badge.label}{badge.cls==='ap'?' @ DUS':''}</em>}<span className="cl-cover">{b.covered?'Über':'Frei'}{b.spot?' — '+b.spot:''}</span></span></span>
 <span className="cl-line cl-person"><strong className="cl-name">{b.customer_name}</strong><span className="cl-meta">{comments>0&&<span><ClaudeGlyph name="chat" size={14} className="cl-chat"/>{comments}</span>}{b.persons>0&&<span><ClaudeGlyph name="users" size={15} className="cl-people"/>{b.persons}</span>}</span></span>
 {(callCounterSlot||returnDriverName)&&<span className="cl-ops">{callCounterSlot&&<><Phone size={12}/>{callCounterSlot}</>}{returnDriverName&&<><UserRound size={12}/>{returnDriverName}</>}</span>}
 {(note||b.key_cash)&&<span className="cl-notes">{note&&<span className={'cl-note'+(/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(note)?' cl-note-ar':'')} dir="auto">{note}</span>}{b.key_cash&&<span className={'cl-note cl-key'+(/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(b.key_cash)?' cl-note-ar':'')} dir="auto">{b.key_cash}</span>}</span>}
 <span className="cl-line cl-bottom"><span className="cl-ref">{referencePresentation?.referenceLabel??('#'+b.code+(b.external_id?' '+b.external_id:''))}</span>{payment&&<span className={'cl-pay '+m.kind} title={referencePresentation?.paymentLabel??m.text} aria-label={referencePresentation?.paymentLabel??m.text}>{payment}</span>}</span>
 </span></button>{callClearSlot}</article>;
}
