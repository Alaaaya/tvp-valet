import {t as tr} from './i18n';
import React,{useEffect,useRef,useState} from 'react';
import {Trash2} from 'lucide-react';
import type {MediaItem} from './handover-api';
type P={initialReason?:string;locked?:boolean;item:MediaItem;busy:boolean;error:string;blocked:string;onCancel:()=>void;onConfirm:(reason:string)=>void};
export function MediaDeleteDialog({item,busy,error,blocked,onCancel,onConfirm,initialReason,locked}:P){
 const[reason,setReason]=useState(initialReason||'');
 const cancel=useRef<HTMLButtonElement>(null);
 useEffect(()=>{cancel.current?.focus()},[]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy){e.stopImmediatePropagation();onCancel()}};window.addEventListener('keydown',k,true);return()=>window.removeEventListener('keydown',k,true)},[busy,onCancel]);
 const sig=item.kind==='signature';
 return <div className="md-scrim" role="alertdialog" aria-modal="true" aria-labelledby="md-t" aria-describedby="md-d" data-edge-back-exclude>
  <div className="md-card"><span className="md-ico"><Trash2 size={24}/></span>
   <h2 id="md-t">{sig?tr("Unterschrift endgültig löschen?"):item.kind==='photo'?tr("Foto endgültig löschen?"):tr("Medium endgültig löschen?")}</h2>
   <p id="md-d">{tr("Das Medium wird unwiderruflich entfernt und kann nicht wiederhergestellt werden.")}</p>
   <label htmlFor="md-reason">{tr("Grund der Löschung")}<textarea id="md-reason" maxLength={500} value={reason} disabled={busy||!!error||locked} onChange={e=>setReason(e.target.value)} /></label>
   {blocked&&<p className="md-err" role="alert">{blocked}</p>}{error&&<p className="md-err" role="alert">{error}</p>}
   <div className="md-acts"><button type="button" ref={cancel} className="md-cancel" disabled={busy} onClick={onCancel}>{tr("Abbrechen")}</button>
    <button type="button" className="md-go" disabled={busy||!!blocked||!reason.trim()} onClick={()=>onConfirm(reason.trim())}>{busy?tr("Wird gelöscht …"):error?tr("Erneut versuchen"):tr("Endgültig löschen")}</button></div></div></div>;
}
