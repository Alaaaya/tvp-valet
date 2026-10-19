import React,{useEffect,useRef} from 'react';
import {useEdgeBack} from './use-edge-back';
import {ChevronLeft,RotateCcw,Car,Bus,Building2,Ship} from 'lucide-react';
import {SERVICE_TYPES,SERVICE_AVAILABLE,DEFAULT_FILTER,type NewFilter,type ServiceType} from './new-filter';
export function NewFilterScreen({filter,set,onClose,locations}:{filter:NewFilter;set:(f:NewFilter)=>void;onClose:()=>void;locations:string[]}){
  const root=useRef<HTMLDivElement>(null);
  useEdgeBack(root,{enabled:true,priority:40,onBack:()=>{onClose()}});
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    root.current?.querySelector<HTMLElement>('button')?.focus();
    return()=>{if(previous?.isConnected)previous.focus()};
  },[]);
  const keys=(e:React.KeyboardEvent)=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();return}
    if(e.key!=='Tab')return;
    const items=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')||[]);
    if(!items.length)return;
    e.preventDefault();
    const i=items.indexOf(document.activeElement as HTMLElement);
    items[e.shiftKey?(i<=0?items.length-1:i-1):(i+1)%items.length].focus();
  };
  const up=(p:Partial<NewFilter>)=>set({...filter,...p});
  const sw=(label:string,key:'cancelled'|'deleted'|'rejected'|'noShow'|'airportOn'|'locationOn',ok:boolean,why='Nicht in den Daten vorhanden')=><label key={label}><span>{label}{!ok&&<small className="nf-why">{why}</small>}</span><input className="switch" type="checkbox" role="switch" disabled={!ok} checked={ok&&filter[key]} onChange={e=>up({[key]:e.target.checked} as Partial<NewFilter>)}/></label>;
  const icon=(s:ServiceType)=>s==='Shuttle'?<Bus size={16}/>:s==='Valet'?<Car size={16}/>:s==='Terminal'?<Building2 size={16}/>:s==='Cruise'?<Ship size={16}/>:null;
  return <div ref={root} className="filter-screen nf" onKeyDown={keys} role="dialog" aria-modal="true" aria-label="Filter neue Buchungen"><header><button aria-label="Filter schließen" onClick={onClose}><ChevronLeft/></button><strong>Filters</strong><span/></header>
    <div className="filter-content"><p>Booking status</p><div className="filter-group">{sw('Cancelled bookings','cancelled',true)}{sw('Deleted bookings','deleted',false,'Kein Löschstatus gespeichert')}{sw('Rejected bookings','rejected',false,'Kein Ablehnungsstatus gespeichert')}{sw('No shows','noShow',true)}</div>
    <p>Show bookings</p><div className="filter-group">
      <label><span>Filter airports<small className="nf-why">Keine Flughafen-Angabe in den Buchungen</small></span><input className="switch" type="checkbox" role="switch" disabled checked={false} readOnly/></label>
      {sw('Filter product locations','locationOn',true)}
      {filter.locationOn&&<label className="nf-select">Produkt (nur eines oder alle)<select aria-label="Produktstandort" value={filter.location} onChange={e=>up({location:e.target.value})}><option value="">Alle Produkte</option>{locations.map(l=><option key={l} value={l}>{l}</option>)}</select></label>}
    </div>
    <p>Service type</p><div className="filter-chips nf-chips" role="group" aria-label="Service type">{SERVICE_TYPES.map(s=>{const ok=SERVICE_AVAILABLE[s];const on=filter.services.includes(s);return <button key={s} type="button" aria-pressed={on} disabled={!ok} title={ok?undefined:'Nicht in den Daten vorhanden'} className={on?'selected':''} onClick={()=>up({services:on?filter.services.filter(x=>x!==s):[...filter.services,s]})}>{icon(s)}{s}</button>})}</div>
    <small className="nf-hint">Ausgegraute Optionen gibt es in den Buchungsdaten nicht und filtern daher nichts. Nur Valet lässt sich aus den Produktcodes ableiten.</small>
    <button className="reset-filters" onClick={()=>set(DEFAULT_FILTER)}><RotateCcw size={18}/> Reset filters</button></div></div>}
