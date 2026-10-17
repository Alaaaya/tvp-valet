import React from 'react';
import {PlaneLanding,PlaneTakeoff,Car,Users,Phone,KeyRound,Check,Banknote,MessageSquare} from 'lucide-react';
import {money,type Booking} from '../model';
import {displayComment} from './comments';
import '../booking-list-row.css';

export interface PartnerBadge{label:string;cls:'ag'|'ap'|'fsp'|'pl'|'pr'|'f2m'}
/** Only real product/platform mappings; unknown sources get no badge. */
export function partnerBadge(b:Pick<Booking,'product'|'platform'>):PartnerBadge|null{
 const p=(b.product||'').trim().toUpperCase(),pl=(b.platform||'').trim().toLowerCase();
 if(p.startsWith('AG-'))return{label:'AvioGo',cls:'ag'};
 if(p.startsWith('AP-'))return{label:'Allopark',cls:'ap'};
 if(p.startsWith('FSP-'))return{label:'Flughafenstellplatz',cls:'fsp'};
 if(/^pl-/i.test(p)||pl==='parkinglist')return{label:'ParkingList',cls:'pl'};
 if(pl==='parkradar24')return{label:'ParkRadar24',cls:'pr'};
 if(pl==='free2move'||pl==='travelcar')return{label:'Free2Move',cls:'f2m'};
 return null;
}
/** Neutral money state from stored totals; no processor is invented. */
export function moneyState(b:Pick<Booking,'total'|'paid'>):{kind:'paid'|'due'|'none';text:string}{
 const due=Math.max(0,(b.total||0)-(b.paid||0));
 if(!b.total)return{kind:'none',text:''};
 return due>0?{kind:'due',text:money(due)+' offen'}:{kind:'paid',text:'Bezahlt '+money(b.total)};
}
export interface BookingListRowProps{
 b:Booking;kind:'in'|'out';time:string;completed:boolean;onOpen:(b:Booking)=>void;
 /** Live flight/status JSX supplied by the list, shown in place of the plain flight number. */
 live?:React.ReactNode;
 /** Optional real count of structured comments; omitted means no indicator. */
 commentCount?:number;
}
export function BookingListRow({b,kind,time,completed,onOpen,live,commentCount}:BookingListRowProps){
 const badge=partnerBadge(b),flight=kind==='in'?b.flight_in:b.flight_out,c=displayComment(b.comment).text.trim();
 const done=kind==='in'?b.checked_in_at:b.checked_out_at,m=moneyState(b),key=(b.key_cash||'').trim();
 return <article className={'blr '+kind+(completed?' done':'')}>
  <button type="button" className="blr-main" onClick={()=>onOpen(b)} aria-label={(kind==='in'?'Annahme ':'Rückgabe ')+time+' '+b.plate+' '+b.customer_name}>
   <span className="blr-time"><b>{kind==='in'?'IN':'OUT'}</b><strong>{time}</strong></span>
   <span className="blr-body">
    <span className="blr-top">{badge&&<em className={'blr-badge '+badge.cls}>{badge.label}</em>}<span className="blr-code">{b.code}</span>{b.external_id&&b.external_id!==b.code&&<span className="blr-code">{b.external_id}</span>}</span>
    <span className="blr-line"><Car size={15}/><strong className="blr-plate">{b.plate||'–'}</strong>{key&&<span className="blr-key"><KeyRound size={14}/>{key}</span>}{done&&<Check size={16} className="blr-check" aria-label="erledigt"/>}</span>
    <span className="blr-line"><Users size={15}/><span className="blr-name">{b.customer_name}</span>{b.persons>0&&<span className="blr-n">{b.persons}</span>}{b.phone&&<Phone size={14} aria-label="Telefon"/>}</span>
    {(live||flight)&&<span className="blr-line blr-flight">{kind==='in'?<PlaneLanding size={15}/>:<PlaneTakeoff size={15}/>}{live||<span>{flight}</span>}</span>}
    {c&&<span className="blr-comment">{c}</span>}
   </span>
   <span className="blr-side">
    <span className={'blr-cover '+(b.covered?'cov':'free')}>{b.covered?'Über':'Frei'}</span>
    {typeof commentCount==='number'&&commentCount>0&&<span className="blr-cc"><MessageSquare size={14}/>{commentCount}</span>}
    {m.kind!=='none'&&<span className={'blr-pay '+m.kind}><Banknote size={13}/>{m.text}</span>}
   </span>
  </button>
 </article>;
}
