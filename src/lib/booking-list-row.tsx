import React from 'react';
import {PlaneLanding,PlaneTakeoff,Car,Users,Phone,KeyRound,Check,Banknote,MessageSquare} from 'lucide-react';
import {money,type Booking} from '../model';
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
 /** Live flight/status JSX supplied by the list, shown in place of the plain flight number. */
 live?:React.ReactNode;
 /** Optional real count of structured comments; omitted means no indicator. */
 commentCount?:number;
 /** Compact call counter from the parent; omit when there are no calls. Freeze/unfreeze is the parent's job. */
 callCounterSlot?:React.ReactNode;
}
/** Counter helper: done/total for one direction over the (done-inclusive) population. */
export function directionCounts(events:readonly {kind:'in'|'out';completed?:boolean}[],kind:'in'|'out'){const k=events.filter(e=>e.kind===kind);return{done:k.filter(e=>!!e.completed).length,total:k.length}}
export function BookingListRow({b,kind,time,completed,onOpen,live,commentCount,callCounterSlot}:BookingListRowProps){
 const badge=partnerBadge(b),flight=kind==='in'?b.flight_in:b.flight_out,c=displayComment(b.comment,true).text.trim();
 const done=kind==='in'?b.checked_in_at:b.checked_out_at,m=moneyState(b),key=(b.key_cash||'').trim();
 return <article className={'blr '+kind+(completed?' done':'')}>
  <button type="button" className="blr-main" onClick={()=>onOpen(b)} aria-label={(kind==='in'?'Annahme ':'Rückgabe ')+time+' '+b.plate+' '+b.customer_name}>
   <span className="blr-time">{completed&&done&&<span className="blr-check" role="img" aria-label="erledigt"><Check size={16} strokeWidth={3}/></span>}<span className="blr-ico"><Car size={16}/><Users size={14}/></span><strong>{flight&&(kind==='in'?<PlaneLanding size={14}/>:<PlaneTakeoff size={14}/>)}{time}</strong>{flight&&<span className="blr-tf">{flight}</span>}</span>
   <span className="blr-body">
    {badge&&<span className="blr-top"><em className={'blr-badge '+badge.cls} title={badge.label}>{badge.product||badge.label}</em>{badge.product&&<small className="blr-prov">{badge.label}</small>}</span>}
    <span className="blr-line"><strong className="blr-plate">{b.plate||'–'}</strong>{key&&<span className="blr-key"><KeyRound size={14}/>{key}</span>}<span className="blr-code">#{b.code}</span>{b.external_id&&b.external_id!==b.code&&<span className="blr-code">{b.external_id}</span>}</span>
    <span className="blr-line"><span className="blr-name">{b.customer_name}</span>{b.phone&&<Phone size={14} aria-label="Telefon"/>}</span>
    {live&&<span className="blr-line blr-flight">{kind==='in'?<PlaneLanding size={15}/>:<PlaneTakeoff size={15}/>}{live}</span>}
    {c&&<span className="blr-comment">{c}</span>}
    {callCounterSlot&&<span className="blr-calls">{callCounterSlot}</span>}
   </span>
   <span className="blr-side">
    <span className={'blr-cover '+(b.covered?'cov':'free')}>{b.covered?'Über':'Frei'}</span>
    {typeof commentCount==='number'&&commentCount>0&&<span className="blr-cc"><MessageSquare size={14}/>{commentCount}</span>}
    {b.persons>0&&<span className="blr-pn"><Users size={14}/>{b.persons}</span>}
    {m.kind!=='none'&&<span className={'blr-pay '+m.kind}>{m.text}</span>}
   </span>
  </button>
 </article>;
}
