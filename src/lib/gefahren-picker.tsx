import React,{useEffect,useRef,useState} from 'react';
import {t as tr} from './i18n';
import {Car,Check,X,Trash2} from 'lucide-react';
import type {Gefahren} from './gefahren-api';
import {trapTab} from './undo-controls';
import {useEdgeBack} from './use-edge-back';
import '../driver-picker.css';
import '../gefahren.css';
export const gefahrenLabel=(v:Gefahren)=>v===null?tr('Gefahren'):tr((v+' gefahren') as '1 gefahren');
export function GefahrenButton({value,disabled,onSave}:{value:Gefahren;disabled?:boolean;onSave?:(v:Gefahren)=>Promise<void>}){
 const[open,setOpen]=useState(false);
 return <><button type="button" className="bd-outline gefahren-button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><Car size={17}/>{gefahrenLabel(value)}</button>{open&&onSave&&<GefahrenPicker value={value} onSave={onSave} onClose={()=>setOpen(false)}/>}</>;
}
export function GefahrenPicker({value,onSave,onClose}:{value:Gefahren;onSave:(v:Gefahren)=>Promise<void>;onClose:()=>void}){
 const[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const box=useRef<HTMLDivElement>(null),saving=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;const old=document.activeElement as HTMLElement|null;box.current?.querySelector<HTMLButtonElement>('button')?.focus();return()=>{alive.current=false;if(old?.isConnected)old.focus()}},[]);
 const close=()=>{if(!saving.current)onClose()};
 useEdgeBack(box,{enabled:true,priority:48,blocked:busy,onBack:()=>{if(saving.current)return false;close()}});
 async function pick(v:Gefahren){
  if(saving.current)return;
  saving.current=true;setBusy(true);setErr('');
  try{await onSave(v);if(alive.current)onClose()}
  catch(e){if(alive.current)setErr(e&&typeof e==='object'&&'message'in e?String(e.message):String(e))}
  finally{saving.current=false;if(alive.current)setBusy(false)}
 }
 return <div className="dps-scrim gefahren-scrim" onClick={close}><div ref={box} className="dps gefahren-picker" role="dialog" aria-modal="true" aria-labelledby="gefahren-title" aria-describedby="gefahren-description" aria-busy={busy} onClick={e=>e.stopPropagation()} onKeyDown={e=>{
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}
 if(e.key==='Tab'){const f=Array.from(box.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);e.preventDefault();if(f.length)f[trapTab(f.indexOf(document.activeElement as HTMLButtonElement),f.length,e.shiftKey)].focus()}
 }}>
 <div className="gefahren-handle" aria-hidden="true"/>
 <header className="dps-head">
 <svg className="gefahren-flight" viewBox="0 0 350 122" fill="none" aria-hidden="true">
 <path d="M0 105c19-18 34-9 41-2 12-24 36-24 49-7 16-8 33-4 40 9 20-13 41-8 51 5 14-14 35-11 43 0 17-22 38-19 51-3 23-15 51-9 75 8v7H0Z" fill="white" opacity=".75"/>
 <path d="M115 62c-12 48 67 54 103 23 15-13 28-12 34-3" stroke="#6a9d83" strokeWidth="2" strokeDasharray="4 6" strokeLinecap="round"/>
 <path d="M246 77a10 10 0 0 1 20 0c0 8-10 16-10 16s-10-8-10-16Z" fill="#337859"/><circle cx="256" cy="77" r="3.5" fill="#e9f5ec"/>
 <g transform="translate(30 25) scale(.85) rotate(-24 55 38)">
 <path d="m15 43 19-8L53 5c2-3 7-4 11-2l-8 27 40-9c14-3 26-1 28 4 2 5-8 11-23 15l-41 9-20 27-9 2 8-26-18 3-17-9 6-4Z" fill="#d4e8d9" stroke="#88ae94" strokeWidth="1"/>
 <path d="m15 40 19-8L53 2c2-3 7-4 11-2l-8 27 40-9c14-3 26-1 28 4 2 5-8 11-23 15l-41 9-20 27-9 2 8-26-18 3-17-9 6-4Z" fill="#fff"/>
 <path d="m16 40 17-8-6-12-9 2 2 15-10 2Z" fill="#2d7054"/>
 <path d="m54 28 9-27-8 1-17 30Z" fill="#6a9f7b"/>
 <path d="m40 49-8 25 8-2 18-26Z" fill="#3e805c"/>
 <path d="m98 19 6 4 9-2-6-3Z" fill="#356e55"/>
 <path d="m64 34 25-6" stroke="#76a086" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 5"/>
 </g></svg>
 <h2 id="gefahren-title">{tr('Gefahren')}</h2>
 <p id="gefahren-description">{tr('Bitte wählen Sie die Anzahl der gefahrenen Kilometer.')}</p><button type="button" className="dps-x" disabled={busy} aria-label={tr('Schließen')} onClick={close}><X size={22}/></button></header>
 {err&&<p role="alert" className="dps-err">{err}</p>}
 <div className="gefahren-options">{([1,2,3,4,null] as Gefahren[]).map(v=><button type="button" key={v??'clear'} className={'dps-row'+(v===value?' on':'')} aria-pressed={v===value} disabled={busy} onClick={()=>void pick(v)}><span className="gefahren-option-main"><span className="gefahren-badge" aria-hidden="true">{v===null?<X size={20}/>:v}</span><span>{v===null?tr('Löschen'):gefahrenLabel(v)}</span></span>{v===null?<Trash2 className="gefahren-trash" size={21} aria-hidden="true"/>:v===value?<Check size={23} strokeWidth={2.7} aria-hidden="true"/>:null}</button>)}</div>
 {busy&&<p role="status" className="dps-note">{tr('Wird gespeichert …')}</p>}
 </div></div>;
}
