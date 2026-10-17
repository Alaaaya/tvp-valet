import React,{useEffect} from 'react';
import {X} from 'lucide-react';
import '../toast.css';

export const TOAST_MS=2000;
export interface ToastState{text:string;n:number}
/** DOM-free timer: schedule() restarts the countdown (clearing any pending one); cancel() clears it. */
export function createToastTimer(ms:number=TOAST_MS){
 let id:ReturnType<typeof setTimeout>|undefined;
 const cancel=()=>{if(id!==undefined){clearTimeout(id);id=undefined}};
 const schedule=(onHide:()=>void)=>{cancel();id=setTimeout(()=>{id=undefined;onHide()},ms);return cancel};
 return{schedule,cancel};
}
/** Overlay toast: fixed, no layout shift. Every new n (even identical text) restarts the 2s timer; unmount/change clears it. */
export function Toast({toast,onHide,ms=TOAST_MS}:{toast:ToastState|null;onHide:()=>void;ms?:number}){
 useEffect(()=>{if(!toast)return;const t=createToastTimer(ms);t.schedule(onHide);return t.cancel},[toast?.n,toast?.text,ms]);
 if(!toast)return null;
 return <div className="toast" role="status" aria-live="polite"><span>{toast.text}</span><button type="button" aria-label="Hinweis schließen" onClick={onHide}><X size={16}/></button></div>;
}
