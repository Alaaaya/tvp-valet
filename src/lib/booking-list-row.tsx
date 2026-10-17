import React from 'react';
import {PlaneLanding,PlaneTakeoff,Car,Users,Phone,KeyRound,Check,Banknote,MessageSquare} from 'lucide-react';
import {money,clock,type Booking} from '../model';
import {displayComment} from './comments';
import '../booking-list-row.css';

export interface PartnerBadge{label:string;product:string;cls:'ag'|'ap'|'fsp'|'pl'|'pr'|'f2m'|'web'}
/** Shows the actual stored product code plus a provider label. Only real mappings; unknown sources get no badge. */
export function partnerBadge(b:{product?:string|null;platform?:string|null}):PartnerBadge|null{
 const product=(b.product||'').trim(),p=product.toUpperCase(),pl=(b.platform||'').trim().toLowerCase().replace(/[\s_-]+/g,'');
 const mk=(label:string,cls:PartnerBadge['cls']):PartnerBadge=>({label,product,cls});
 if(p.startsWith('AG-'))return mk('AvioGo','ag');
 if(p.startsWith('AP-'))return mk('Allopark','ap');
 if(p.startsWith('FSP-'))return mk('Flughafenstellplatz','fsp');
 if(p.startsWith('F2M-'))return mk('Free2Move','f2m');
 if(p.startsWith('PL-')||pl==='parkinglist')return mk('ParkingList','pl');
 if(pl==='parkradar24'||pl==='parkradar')return mk('ParkRadar24','pr');
 if(pl==='free2move'||pl==='travelcar'||pl==='f2m')return mk('Free2Move','f2m');
 if(p.startsWith('WEB-')||p.startsWith('WEB ')||['website','web','direct','direkt','homepage'].includes(pl))return mk('Direkt Web','web');
 return null;
}
/** Neutral money state from stored totals; no processor is invented. */
export function moneyState(b:Pick<Booking,'total'|'paid'>):{kind:'paid'|'due'|'none';text:string}{
 const due=Math.max(0,(b.total||0)-(b.paid||0));
 if(!b.total)return{kind:'none',text:''};
 return due>0?{kind:'due',text:'Offen | '+money(due)}:{kind:'paid',text:'Bezahlt | '+money(b.paid||0)};
}
export interface BookingListRowProps{
 b:Booking;kind:'in'|'out';time:string;completed:boolean;onOpen:(b:Booking)=>void;
 /** Compatibility slot retained for callers; separate status is deliberately not rendered. */
 live?:React.ReactNode;
 /** Optional real count of structured comments; omitted means no indicator. */
 commentCount?:number;
 /** Compact call counter from the parent; omit when there are no calls. Freeze/unfreeze is the parent's job. */
 callCounterSlot?:React.ReactNode;
}
/** Counter helper: done/total for one direction over the (done-inclusive) population. */
export function directionCounts(events:readonly {kind:'in'|'out';completed?:boolean}[],kind:'in'|'out'){const k=events.filter(e=>e.kind===kind);return{done:k.filter(e=>!!e.completed).length,total:k.length}}
/** Imported provenance sometimes repeats the external reference as a pipe token.
 * Omit only that exact token in this row's display, never edit stored comments. */
export function rowComment(b:Pick<Booking,'comment'|'external_id'|'code'>){
 const text=displayComment(b.comment,true).text.trim(),id=b.external_id?.trim();
 if(!id||id===b.code)return text;
 const reference=id.split('|').map(part=>part.trim());
 return text.split('\n').map(line=>{
  const parts=line.split('|'),kept:string[]=[];
  for(let i=0;i<parts.length;){
   if(reference.every((part,j)=>parts[i+j]?.trim()===part))i+=reference.length;
   else kept.push(parts[i++]);
  }
  return kept.join('|').trim();
 }).filter(Boolean).join('\n').trim();
}
export function BookingListRow({b,kind,time,completed,onOpen,live,commentCount,callCounterSlot}:BookingListRowProps){
 const badge=partnerBadge(b),flight=kind==='in'?b.flight_in:b.flight_out,c=rowComment(b);
 const actualFlight=kind==='in'?b.actual_flight_in:b.actual_flight_out;
 const actualFlightClock=actualFlight&&Number.isFinite(Date.parse(actualFlight))?clock(actualFlight):null;
 const done=kind==='in'?b.checked_in_at:b.checked_out_at,m=moneyState(b),key=(b.key_cash||'').trim();
 return <article className={'blr '+kind+(completed?' done':'')}>
  <button type="button" className="blr-main" onClick={()=>onOpen(b)} aria-label={(kind==='in'?'Annahme ':'Rückgabe ')+time+' '+b.plate+' '+b.customer_name}>
   <span className="blr-time">{completed&&done&&<span className="blr-check" role="img" aria-label="erledigt"><Check size={18} strokeWidth={3}/></span>}<span className="blr-ico"><Car size={20}/><Users size={18}/></span><strong>{time}</strong>{(flight||actualFlightClock)&&<span className="blr-tf">{kind==='in'?<PlaneLanding size={14}/>:<PlaneTakeoff size={14}/>}<span>{actualFlightClock&&<b className="blr-actual-flight">{actualFlightClock} </b>}{flight}</span></span>}</span>
   <span className="blr-body">
    <span className="blr-line blr-l1">{badge&&<em className={'blr-badge '+badge.cls} title={badge.label}>{badge.product||badge.label}</em>}{badge&&badge.product&&<small className="blr-prov">{badge.label}</small>}</span>
    <span className="blr-line blr-l2" title={[b.plate,key,b.code].filter(Boolean).join(" · ")}><strong className="blr-plate">{b.plate||'–'}</strong>{key&&<span className="blr-key"><KeyRound size={15}/><span className="blr-keycode">{key}</span></span>}<span className="blr-code">#{b.code}</span></span>
    <span className="blr-line blr-l3">{b.phone&&<Phone size={16} aria-label="Telefon"/>}<span className="blr-name" title={b.customer_name}>{b.customer_name}</span></span>
    {c&&<span className="blr-comment" title={c}>{c}</span>}
    {callCounterSlot&&<span className="blr-calls">{callCounterSlot}</span>}
   </span>
   <span className="blr-side">
    <span className={'blr-cover '+(b.covered?'cov':'free')}>{b.covered?'Über':'Frei'}</span>
    <span className="blr-meta">{typeof commentCount==='number'&&commentCount>0&&<span className="blr-cc"><MessageSquare size={16}/>{commentCount}</span>}{b.persons>0&&<span className="blr-pn">{b.persons}<Users size={16}/></span>}</span>
    {m.kind!=='none'&&<span className={'blr-pay '+m.kind} aria-label={m.text} title={m.text}>{money(m.kind==='due'?Math.max(0,(b.total||0)-(b.paid||0)):(b.paid||0))}</span>}
   </span>
  </button>
 </article>;
}
