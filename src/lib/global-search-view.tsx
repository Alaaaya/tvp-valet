import React,{useEffect,useMemo,useRef,useState} from 'react';
import {t as tr} from './i18n';
import {stamp} from '../model';
import type {Booking} from '../model';
import {createGlobalSearch,type SearchHit} from './global-search';
import './global-search-view.css';
export type Coverage={from:number|null;to:number|null;at:number|null;partial:boolean};
export type GlobalSource={rows:Booking[];source:'online'|'cache';coverage?:Coverage};
type State={q:string;rows:Booking[];source:'online'|'cache';coverage?:Coverage}|{q:string;error:string}|{q:string;loading:true};
const d=(ms:number|null)=>ms==null?'?':new Date(ms).toLocaleDateString('de-DE',{timeZone:'Europe/Berlin'});
export function coverageText(c?:Coverage){
 if(!c)return '';
 if(!c.partial)return tr("Zwischengespeichert: alle verfügbaren Buchungen")+(c.at?' · '+new Date(c.at).toLocaleString('de-DE',{timeZone:'Europe/Berlin'}):'');
 return tr("Nur gespeicherter Zeitraum")+' '+d(c.from)+' – '+d(c.to)+(c.at?' · '+new Date(c.at).toLocaleString('de-DE',{timeZone:'Europe/Berlin'}):'');
}
export function GlobalSearchView({query,scopeKey,load,onOpen,now}:{query:string;scopeKey:string;load:(signal:AbortSignal)=>Promise<GlobalSource>;onOpen:(b:Booking)=>void;now?:()=>number}){
 const [state,setState]=useState<State|null>(null);
 const meta=useRef<{source:'online'|'cache';coverage?:Coverage}>({source:'online'});
 const loadRef=useRef(load);loadRef.current=load;
 const engine=useRef<ReturnType<typeof createGlobalSearch<Booking>>|null>(null);
 useEffect(()=>{
  const e=createGlobalSearch<Booking>({load:async s=>{const r=await loadRef.current(s);meta.current={source:r.source,coverage:r.coverage};return r.rows},now,
   onResult:r=>{if(!r){setState(null);return}if('error' in r)setState({q:r.query,error:r.error instanceof Error?r.error.message:String(r.error)});else setState({q:r.query,rows:r.rows,...meta.current})}});
  engine.current=e;return()=>{e.dispose();engine.current=null};
 },[scopeKey]); // account switch: drop cache, abort, discard late results
 useEffect(()=>{setState(query.trim()?{q:query,loading:true}:null);engine.current?.set(query)},[query,scopeKey]);
 const st=state;
 return <section className="gs" aria-label={tr("Suche in allen Tagen")} aria-live="polite">
  {(!st||'loading' in st)&&<p className="gs-note">{tr("Suche in allen Tagen …")}</p>}
  {st&&'error' in st&&<p className="gs-note gs-err" role="alert">{tr("Suche fehlgeschlagen")}: {st.error}</p>}
  {st&&'rows' in st&&<>
   <p className="gs-note">{st.rows.length+' '+tr("Treffer in allen Tagen")}{st.source==='cache'&&<span className="gs-cache"> · {coverageText(st.coverage)}</span>}</p>
   {!st.rows.length&&<p className="gs-empty">{st.source==='cache'?tr("Keine Treffer im gespeicherten Zeitraum."):tr("Keine Buchung gefunden.")}</p>}
   <div className="gs-list">{st.rows.map(b=><button type="button" key={b.id} className={'gs-row st-'+b.status} onClick={()=>onOpen(b)}>
    <strong className="gs-plate" dir="ltr">{b.plate||'—'}</strong>
    <span className="gs-name">{b.customer_name}</span>
    <span className="gs-dates"><span dir="ltr">{stamp(b.arrival_at)}</span> → <span dir="ltr">{stamp(b.departure_at)}</span></span>
    <span className="gs-meta"><span dir="ltr">{b.code}</span>{b.status!=='confirmed'&&<em>{b.status==='cancelled'?tr("storniert"):tr("No-Show")}</em>}</span>
   </button>)}</div></>}
 </section>;
}
