import React,{useEffect,useRef,useState} from 'react';
import {t as tr} from './i18n';
import {Car,Check,X} from 'lucide-react';
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
 return <div className="dps-scrim gefahren-scrim" onClick={close}><div ref={box} className="dps gefahren-picker" role="dialog" aria-modal="true" aria-labelledby="gefahren-title" aria-busy={busy} onClick={e=>e.stopPropagation()} onKeyDown={e=>{
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close()}
 if(e.key==='Tab'){const f=Array.from(box.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);e.preventDefault();if(f.length)f[trapTab(f.indexOf(document.activeElement as HTMLButtonElement),f.length,e.shiftKey)].focus()}
 }}><header className="dps-head"><h2 id="gefahren-title">{tr('Gefahren')}</h2><button type="button" className="dps-x" disabled={busy} aria-label={tr('Schließen')} onClick={close}><X size={22}/></button></header>
 {err&&<p role="alert" className="dps-err">{err}</p>}
 <div className="gefahren-options">{([1,2,3,4,null] as Gefahren[]).map(v=><button type="button" key={v??'clear'} className={'dps-row'+(v===value?' on':'')} aria-pressed={v===value} disabled={busy} onClick={()=>void pick(v)}><span>{v===null?tr('Gefahren löschen'):gefahrenLabel(v)}</span>{v===value&&<Check size={18} aria-hidden="true"/>}</button>)}</div>
 {busy&&<p role="status" className="dps-note">{tr('Wird gespeichert …')}</p>}
 </div></div>;
}
