import React,{useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {t as tr} from './i18n';
import {stamp} from '../model';
export function CallConfirm({calledAt,busy,stale,retry,error,canClear,onClear,onRepeat,onClose}:{calledAt:string;busy:boolean;stale:boolean;retry:boolean;error:string;canClear:boolean;onClear:()=>void;onRepeat:()=>void;onClose:()=>void}){
 const dlg=useRef<HTMLDivElement>(null),cancel=useRef<HTMLButtonElement>(null),latest=useRef({busy,onClose});
 latest.current={busy,onClose};
 useEffect(()=>{const opener=document.activeElement as HTMLElement|null;cancel.current?.focus();
 const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(!latest.current.busy)latest.current.onClose()}
 if(e.key==='Tab'){const buttons=Array.from(dlg.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);e.preventDefault();e.stopImmediatePropagation();const i=buttons.indexOf(document.activeElement as HTMLButtonElement);if(buttons.length)buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();else dlg.current?.focus()}};
 document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);if(opener?.isConnected)opener.focus()}},[]);
 return createPortal(<div ref={dlg} tabIndex={-1} className="call-confirm call-ask" role="alertdialog" aria-modal="true" aria-label={tr("Erneuten Anruf bestätigen")} onClick={e=>e.stopPropagation()}><p>{tr("Es gibt schon einen Anruf (")}{stamp(calledAt)}{tr("). Wirklich einen weiteren Anruf speichern?")}</p>{error&&<p role="alert">{error}</p>}<button type="button" className="call-clear" disabled={busy||(!retry&&!stale&&!canClear)} onClick={onClear}>{stale?tr("Neu laden"):tr("Anruf löschen")}</button><button type="button" className="primary" disabled={busy||stale||retry} onClick={onRepeat}>{tr("Ja, erneut speichern")}</button><button ref={cancel} type="button" className="outline call-cancel" disabled={busy} onClick={onClose}>{tr("Abbrechen")}</button></div>,document.body);
}
