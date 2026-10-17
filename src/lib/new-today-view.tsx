import React from 'react';
import {ChevronLeft,ChevronRight,Car,Users,MessageSquare} from 'lucide-react';
import {clock,money,type Booking} from '../model';
import {applyNewFilter,DEFAULT_FILTER,type NewFilter} from './new-filter';
import {newTodaySummary,shiftDate,shortDate,IMPORT_NOTE} from './new-today';
export function NewToday({rows,date,setDate,open,filter=DEFAULT_FILTER}:{rows:readonly Booking[];filter?:NewFilter;date:string;setDate:(d:string)=>void;open:(b:Booking)=>void}){
  const all=newTodaySummary(rows,date);const s=newTodaySummary(applyNewFilter(rows,filter),date);const hidden=all.created-s.created;
  return <div className="nt">
    <div className="nt-summary" role="status">New: <strong>{s.created}</strong> <span>Arriving today: <strong>{s.arriving}</strong></span></div>
    <div className="nt-nav"><button type="button" aria-label="Vorheriger Tag" onClick={()=>setDate(shiftDate(date,-1))}><ChevronLeft size={24}/></button><span className="nt-date" aria-live="polite">{shortDate(date)}</span><button type="button" aria-label="Nächster Tag" onClick={()=>setDate(shiftDate(date,1))}><ChevronRight size={24}/></button></div>
    <div className="nt-list">{s.list.map(b=><button type="button" className="nt-row" key={b.id} onClick={()=>open(b)}>
      <span className="nt-time"><Car size={20}/><strong>{clock(b.created_at)}</strong></span>
      <span className="nt-body"><span className="nt-tags"><span className="prod">{b.product}{b.covered?' · Über':''}</span><span className="cov">{b.covered?'Über':'Frei'}</span></span>
        <span className="nt-plate"><strong>{b.plate||'–'}</strong><small>#{b.code}</small>{b.external_id&&b.external_id!==b.code&&<small>{b.external_id}</small>}</span>
        <span className="nt-name"><span>{b.customer_name}</span><span className="nt-n">{b.comment&&<><MessageSquare size={13}/>1</>}<Users size={13}/>{b.persons}</span></span>
        <span className="nt-foot"><span>{b.platform}</span><span className="nt-pill">{b.platform} | {money(Math.max(0,b.total-b.paid))}</span></span></span></button>)}</div>
    {hidden>0&&<p className="nt-hidden" role="status">{hidden} Buchung(en) durch Filter ausgeblendet.</p>}{!s.list.length&&<p className="nt-empty">Keine Buchungen an diesem Tag erstellt.</p>}
    <p className="nt-note">{IMPORT_NOTE}</p>
  </div>}
