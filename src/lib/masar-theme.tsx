import React,{useEffect,useRef} from 'react';
import {PlaneLanding,PlaneTakeoff,Check,ChevronRight} from 'lucide-react';
import {money} from '../model';
import {useLanguage,t as tr} from './i18n';
import {plateKind} from './plate-country';
import {directionCounts,type BookingListRowProps,partnerBadge,moneyState} from './booking-list-row';

/** DOM-only tween; stored totals and accessible value always remain exact. */
function Count({value}:{value:number}){
 const node=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  const el=node.current;if(!el||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  let frame=0;const start=performance.now();
  const draw=(now:number)=>{const t=Math.min(1,(now-start)/480);el.textContent=String(Math.round(value*(1-Math.pow(1-t,3))));if(t<1)frame=requestAnimationFrame(draw)};
  frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);
 },[value]);
 return <><span aria-hidden="true" ref={node}>{value}</span><span className="masar-sr">{value}</span></>;
}
export function MasarSummary({events,parked,type,onType}:{events:readonly {kind:'in'|'out';completed?:boolean}[];parked:number;type:string;onType:(value:'all'|'in'|'out')=>void}){
 const lang=useLanguage(),incoming=directionCounts(events,'in'),outgoing=directionCounts(events,'out');
 return <div className="masar-summary" dir="ltr">
  {([{kind:'in',label:tr('Inbound'),count:incoming},{kind:'out',label:tr('Outbound'),count:outgoing}] as const).map(x=><button key={x.kind} className={type===x.kind?'chosen':''} aria-pressed={type===x.kind} onClick={()=>onType(type===x.kind?'all':x.kind)}>
   <span>{x.label}</span><strong><Count value={x.count.total}/><small><Check size={11}/>{x.count.done}</small></strong>
  </button>)}
  <div><span>{lang==='ar'?'بالموقف':lang==='en'?'On lot':'Vor Ort'}</span><strong><Count value={parked}/></strong></div>
 </div>;
}
export function MasarRow({b,kind,time,completed,onOpen,timelineHour,callCounterSlot,callClearSlot,returnDriverName,live}:BookingListRowProps){
 const badge=partnerBadge(b),flight=kind==='in'?b.flight_in:b.flight_out,lang=useLanguage(),m=moneyState(b);
 const label=completed?tr('erledigt'):kind==='in'?tr('Annahme'):tr('Rückgabe');
 return <article className={'blr masar-event '+kind+(completed?' done':'')} data-checked-in={!!b.checked_in_at}>
  {timelineHour&&<div className="masar-hour"><time>{timelineHour}</time><span>{lang==='ar'?'حركة السيارات':lang==='en'?'Schedule':'Tagesablauf'}</span></div>}
  <button type="button" className="masar-row" onClick={()=>onOpen(b)} aria-label={label+' '+time+' '+b.plate+' '+b.customer_name}>
   <span className="masar-rail"><span className="masar-dot"/><time>{time}</time>{kind==='in'?<PlaneTakeoff size={16}/>:<PlaneLanding size={16}/>}</span>
   <span className="masar-ticket">
    <span className="masar-ticket-top"><strong className="blr-plate" data-plate-country={plateKind(b.plate)}>{b.plate||'–'}</strong><span className={'masar-status '+kind}>{completed&&<Check size={11}/>} {label}</span></span>
    <strong className="masar-name">{b.customer_name}</strong>
    <span className="masar-meta"><span>{flight||'–'}</span><span>{badge?.label||b.platform}</span><ChevronRight size={15}/></span>
    <span className="masar-footer"><span>{b.covered?tr('Über'):tr('Frei')}{b.spot?' · '+b.spot:''}{returnDriverName?' · '+returnDriverName:''}</span>{m.kind!=='none'&&<span className={'masar-money '+m.kind} title={m.text}>{m.kind==='paid'?<Check size={12}/>:null}{money(m.kind==='due'?Math.max(0,b.total-b.paid):b.paid)}</span>}</span>
    {live}{callCounterSlot&&<span className="masar-call">{callCounterSlot}</span>}
   </span>
  </button>{callClearSlot}
 </article>;
}
