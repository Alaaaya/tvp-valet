import {t as tr} from './i18n';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Check,Search,X} from 'lucide-react';
import {db} from '../api';
import type {Employee} from '../model';
import {trapTab} from './undo-controls';
import {useEdgeBack} from './use-edge-back';
import '../driver-picker.css';

/** Every active staff account (any role), read fresh from profiles when the picker opens, so accounts added
 * later appear without an app update. No driver role is required. */
export async function loadAssignableStaff():Promise<Employee[]>{
  if(!db)throw new Error(tr("Backend nicht eingerichtet"));
  const {data,error}=await db.from('profiles').select('id,full_name,role,active');
  if(error)throw error;
  return (data??[]).filter(x=>x.active).map(({id,full_name,role})=>({id,full_name,role}));
}
const firstName=(n:string)=>(n||'').trim().split(/\s+/)[0]||'';
/** A→Z (or Z→A) by first name, then full name; stable and locale aware. */
export function sortByFirstName(list:Employee[],dir:'asc'|'desc'='asc'){
  const c=new Intl.Collator('de',{sensitivity:'base',numeric:true});
  const r=[...list].sort((a,b)=>c.compare(firstName(a.full_name),firstName(b.full_name))||c.compare(a.full_name,b.full_name)||a.id.localeCompare(b.id));
  return dir==='asc'?r:r.reverse();
}
export type PickerRow={key:string;id:string|null;label:string};
/** Rows in display order: "du selbst", every other account (sorted), "Nicht dem Fahrer zugeordnet" last. */
export function pickerRows(staff:Employee[],meId:string|undefined,query:string,dir:'asc'|'desc'='asc'):PickerRow[]{
  const q=query.trim().toLocaleLowerCase('de');
  const seen=new Set<string>();const others=staff.filter(e=>e.id!==meId&&e.full_name?.trim()&&!seen.has(e.id)&&(seen.add(e.id),true));
  const me=meId?staff.find(e=>e.id===meId):undefined;
  const hit=(...s:(string|undefined)[])=>!q||s.some(x=>x&&x.toLocaleLowerCase('de').includes(q));
  const rows:PickerRow[]=[];
  if(meId&&hit(tr("du selbst"),me?.full_name))rows.push({key:'me',id:meId,label:tr("du selbst")});
  for(const e of sortByFirstName(others,dir))if(hit(e.full_name))rows.push({key:e.id,id:e.id,label:e.full_name});
  if(hit(tr("Nicht dem Fahrer zugeordnet")))rows.push({key:'none',id:null,label:tr("Nicht dem Fahrer zugeordnet")});
  return rows;
}

export interface DriverPickerSheetProps{
  /** currently assigned driver id (null = unassigned) */
  assignedId:string|null;
  /** signed-in account; shown as "du selbst" */
  meId?:string;
  /** accounts known right now (shown immediately; replaced by the fresh load) */
  staff:Employee[];
  /** fresh read of all accounts when the sheet opens; absent = use staff as is */
  load?:()=>Promise<Employee[]>;
  onLoaded?:(list:Employee[])=>void;
  /** persist the assignment (caller owns the write); resolves when saved */
  onPick:(id:string|null)=>Promise<void>;
  onClose:()=>void;
}
export function DriverPickerSheet(p:DriverPickerSheetProps){
  const[list,setList]=useState<Employee[]>(p.staff),[query,setQuery]=useState(''),[dir,setDir]=useState<'asc'|'desc'>('asc');
  const[busy,setBusy]=useState<string|null>(null),[err,setErr]=useState(''),[loadErr,setLoadErr]=useState('');
  const box=useRef<HTMLDivElement>(null),saving=useRef(false);
  useEffect(()=>{let live=true;if(p.load)p.load().then(l=>{if(!live)return;setList(l);setLoadErr('');p.onLoaded?.(l)}).catch(e=>{if(live)setLoadErr(e instanceof Error?e.message:String(e))});return()=>{live=false}},[]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{const o=document.activeElement as HTMLElement|null;box.current?.querySelector<HTMLElement>('.dps-x')?.focus();return()=>{setTimeout(()=>o?.focus?.(),0)}},[]);
  const rows=useMemo(()=>pickerRows(list,p.meId,query,dir),[list,p.meId,query,dir]);
  const close=()=>{if(saving.current)return false;p.onClose();return true};
  useEdgeBack(box,{enabled:true,priority:45,blocked:!!busy,onBack:()=>{if(!close())return false}});
  async function pick(r:PickerRow){
    if(saving.current)return;
    if(r.id===p.assignedId){p.onClose();return}
    saving.current=true;setBusy(r.key);setErr('');
    try{await p.onPick(r.id);saving.current=false;p.onClose()}catch(e){setErr(e instanceof Error?e.message:String(e))}finally{saving.current=false;setBusy(null)}
  }
  const keys=(e:React.KeyboardEvent)=>{
    if(e.key==='Escape'){e.stopPropagation();e.preventDefault();close();return}
    if(e.key!=='Tab')return;
    const f=Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')||[]);if(!f.length)return;
    e.preventDefault();f[trapTab(f.indexOf(document.activeElement as HTMLElement),f.length,e.shiftKey)].focus();
  };
  return <div className="dps-scrim" onClick={()=>{close()}}>
    <div ref={box} className="dps" role="dialog" aria-modal="true" aria-labelledby="dps-t" onKeyDown={keys} onClick={e=>e.stopPropagation()}>
      <div className="dps-handle" aria-hidden="true"/>
      <header className="dps-head"><h2 id="dps-t">{tr("Fahrer zuweisen")}</h2>
        <button type="button" className="dps-sort" aria-label={tr("Sortierung nach Vorname umkehren")} onClick={()=>setDir(d=>d==='asc'?'desc':'asc')}>{dir==='asc'?tr("A→Z Vorname"):tr("Z→A Vorname")}</button>
        <button type="button" className="dps-x" aria-label={tr("Schließen")} disabled={!!busy} onClick={()=>{close()}}><X size={22} strokeWidth={3}/></button></header>
      <div className="dps-search"><label><Search size={20} aria-hidden="true"/><input type="search" aria-label={tr("Suchen")} placeholder={tr("Suchen")} value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
      {err&&<p className="dps-err" role="alert">{err}</p>}
      {loadErr&&<p className="dps-note" role="status">{tr("Liste evtl. nicht aktuell: ")}{loadErr}</p>}
      <ul className="dps-list" role="listbox" aria-label={tr("Fahrer zuweisen")}>
        {rows.map(r=>{const on=r.id===p.assignedId;return <li key={r.key} role="none"><button type="button" role="option" aria-selected={on} className={'dps-row'+(on?' on':'')} data-key={r.key} disabled={!!busy} onClick={()=>void pick(r)}>
          <span>{busy===r.key?tr("Wird gespeichert …"):r.label}</span>{on&&<span className="dps-check" aria-hidden="true"><Check size={14} strokeWidth={4}/></span>}</button></li>})}
        {!rows.length&&<li className="dps-empty">{tr("Keine Treffer")}</li>}
      </ul>
    </div></div>;
}
export default DriverPickerSheet;
