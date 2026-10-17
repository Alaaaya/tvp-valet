import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ChevronLeft,RotateCcw,Bus,Car,Building2,Ship} from 'lucide-react';
import type {Booking} from '../model';
import {SERVICE_TYPES,bookingService,defaultMainFilters,normalizeMainFilters,type MainBookingFilters,type ServiceType} from './booking-filters';
import {trapTab} from './undo-controls';
import '../main-filter.css';

export interface MainFilterViewProps{filter:MainBookingFilters;onChange:(next:MainBookingFilters)=>void;date:string;onDate:(date:string)=>void;onClose:()=>void;rows:Booking[];userId?:string}
const NOT_STORED='Nicht gespeichert';
export const SERVICE_ICON:Record<ServiceType,React.ReactNode>={Shuttle:<Bus size={16}/>,Valet:<Car size={16}/>,Terminal:<Building2 size={16}/>,Cruise:<Ship size={16}/>,'Valet/Shuttle':<Car size={16}/>,'Shuttle/Valet':<Bus size={16}/>};
/** Hours: finite 0..24, fractions allowed; anything else keeps the previous value. */
export function parseHours(v:string):number|null{const t=v.trim().replace(',','.');if(t===''||!/^\d+(\.\d+)?$/.test(t))return null;const n=Number(t);return Number.isFinite(n)&&n>=0&&n<=24?n:null}

export function MainFilterView({filter:raw,onChange,date,onDate,onClose,rows,userId}:MainFilterViewProps){
  const filter=normalizeMainFilters(raw);
  const box=useRef<HTMLDivElement>(null);
  const[prodOpen,setProdOpen]=useState(filter.products.length>0),[placeOpen,setPlaceOpen]=useState(filter.placements.length>0);
  const[bef,setBef]=useState(String(filter.before)),[aft,setAft]=useState(String(filter.after));
  useEffect(()=>{setBef(String(filter.before))},[filter.before]);useEffect(()=>{setAft(String(filter.after))},[filter.after]);
  useEffect(()=>{const o=document.activeElement as HTMLElement|null;box.current?.querySelector<HTMLElement>('button')?.focus();return()=>{setTimeout(()=>o?.focus(),0)}},[]);
  const products=useMemo(()=>[...new Set(rows.map(b=>b.product).filter(Boolean))].sort(),[rows]);
  const hasPlace={covered:rows.some(b=>b.covered),open:rows.some(b=>!b.covered)};
  const valetOk=rows.some(b=>bookingService(b)==='Valet');
  const up=(p:Partial<MainBookingFilters>)=>onChange({...filter,...p});
  const keys=(e:React.KeyboardEvent)=>{
    if(e.key==='Escape'){e.stopPropagation();onClose();return}
    if(e.key!=='Tab')return;
    const f=Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')||[]);
    if(!f.length)return;e.preventDefault();f[trapTab(f.indexOf(document.activeElement as HTMLElement),f.length,e.shiftKey)].focus();
  };
  const sw=(label:string,on:boolean,set:(v:boolean)=>void,o:{disabled?:boolean;why?:string;left?:boolean}={})=>
    <label key={label} className={'mf-row'+(o.left?' left':'')}>{o.left&&<input className="mf-switch" type="checkbox" role="switch" disabled={o.disabled} checked={!o.disabled&&on} onChange={e=>set(e.target.checked)}/>}<span>{label}{o.disabled&&o.why&&<small className="mf-why">{o.why}</small>}</span>{!o.left&&<input className="mf-switch" type="checkbox" role="switch" disabled={o.disabled} checked={!o.disabled&&on} onChange={e=>set(e.target.checked)}/>}</label>;
  const hrs=(label:string,val:string,set:(s:string)=>void,key:'before'|'after')=>
    <label className="mf-row" key={key}><span>{label}</span><input className="mf-num" inputMode="decimal" aria-label={label} value={val} aria-invalid={parseHours(val)===null} onChange={e=>{set(e.target.value);const n=parseHours(e.target.value);if(n!==null)up({[key]:n} as Partial<MainBookingFilters>)}} onBlur={()=>set(String(filter[key]))}/></label>;
  const toggleIn=(list:string[],v:string)=>list.includes(v)?list.filter(x=>x!==v):[...list,v];
  const chip=(label:string,on:boolean,click:()=>void,o:{disabled?:boolean;why?:string;icon?:React.ReactNode;check?:boolean}={})=>
    <button key={label} type="button" aria-pressed={on} disabled={o.disabled} title={o.disabled?o.why:undefined} className={'mf-chip'+(on?' on':'')} onClick={click}>{on&&o.check&&<span aria-hidden="true">✓ </span>}{o.icon}{label}</button>;
  const flightsOn=filter.flights;
  return <div ref={box} className="mf" role="dialog" aria-modal="true" aria-label="Filter Buchungen" onKeyDown={keys}>
    <header className="mf-head"><button type="button" className="mf-back" aria-label="Filter schließen" onClick={onClose}><ChevronLeft/></button><strong>Filters</strong><span/></header>
    <div className="mf-body">
      <h3>Date</h3><div className="mf-card"><label className="mf-row"><span>Show bookings for</span><input className="mf-date" type="date" aria-label="Datum" value={date} onChange={e=>{if(e.target.value)onDate(e.target.value)}}/></label></div>
      <h3>Booking status</h3><div className="mf-card">
        {sw('Show checked-in/out bookings',filter.done,v=>up({done:v}))}
        {sw('Cancelled bookings',filter.cancelled,v=>up({cancelled:v}))}
        {sw('Deleted bookings',false,()=>{},{disabled:true,why:'Kein Löschstatus gespeichert'})}
        {sw('Rejected bookings',false,()=>{},{disabled:true,why:'Kein Ablehnungsstatus gespeichert'})}
        {sw('No shows',filter.noshow,v=>up({noshow:v}))}
      </div>
      <h3>Show bookings</h3><div className="mf-card">
        {sw('Assigned to me',filter.assigned,v=>up({assigned:v}),{disabled:!userId,why:'Nicht angemeldet'})}
        {sw('Filter airports',false,()=>{},{disabled:true,why:'Keine Flughafen-Angabe in den Buchungen'})}
        {sw('Filter product locations',prodOpen,v=>{setProdOpen(v);if(!v)up({products:[]})},{disabled:!products.length,why:'Keine Produkte vorhanden'})}
        {prodOpen&&products.length>0&&<div className="mf-sub" role="group" aria-label="Produkte">{products.map(p=>chip(p,filter.products.includes(p),()=>up({products:toggleIn(filter.products,p)})))}</div>}
        {sw('Filter placement locations',placeOpen,v=>{setPlaceOpen(v);if(!v)up({placements:[]})},{disabled:!hasPlace.covered&&!hasPlace.open,why:'Keine Buchungen vorhanden'})}
        {placeOpen&&<div className="mf-sub" role="group" aria-label="Platzierung">{chip('Covered',filter.placements.includes('covered'),()=>up({placements:toggleIn(filter.placements,'covered')}),{disabled:!hasPlace.covered,why:'Keine überdachten Buchungen'})}{chip('Open',filter.placements.includes('open'),()=>up({placements:toggleIn(filter.placements,'open')}),{disabled:!hasPlace.open,why:'Keine Freiflächen-Buchungen'})}</div>}
      </div>
      <h3>Display options</h3><div className="mf-card">
        {sw('Use flight times',flightsOn,v=>up({flights:v}),{left:true})}
        {sw('Outbound: use/show flight time',filter.flInOn,v=>up({flInOn:v}),{left:true,disabled:!flightsOn,why:'Flugzeiten sind aus'})}
        {sw('Return: use/show flight time',filter.flOutOn,v=>up({flOutOn:v}),{left:true,disabled:!flightsOn,why:'Flugzeiten sind aus'})}
        {hrs('Hours before date boundary',bef,setBef,'before')}
        {hrs('Hours after date boundary',aft,setAft,'after')}
      </div>
      <h3>Type of bookings</h3><div className="mf-chips" role="group" aria-label="Type of bookings">
        {([['all','All'],['in','Incoming'],['out','Outgoing']] as const).map(([k,l])=>chip(l,filter.type===k,()=>up({type:k}),{check:true}))}
      </div>
      <h3>Service type</h3><div className="mf-chips" role="group" aria-label="Service type">
        {SERVICE_TYPES.map(s=>{const ok=s==='Valet'&&valetOk;return chip(s,ok&&filter.services.includes(s),()=>up({services:toggleIn(filter.services,s) as ServiceType[]}),{disabled:!ok,why:NOT_STORED,icon:SERVICE_ICON[s]})})}
      </div>
      <small className="mf-hint">Ausgegraute Optionen gibt es in den Buchungsdaten nicht. Nur Valet lässt sich aus den Produktcodes ableiten.</small>
      <button type="button" className="mf-reset" onClick={()=>{const d=defaultMainFilters();setProdOpen(false);setPlaceOpen(false);onChange(d)}}><RotateCcw size={18}/> Reset filters</button>
    </div></div>}
export const MainFilterScreen=MainFilterView;
