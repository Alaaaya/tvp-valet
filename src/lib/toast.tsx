import React,{useEffect} from 'react';
import {X} from 'lucide-react';
import '../toast.css';

export const TOAST_MS=2000;
export interface ToastState{text:string;n:number}
/** Overlay toast: fixed, no layout shift. Every new n (even same text) restarts the 2s timer; unmount/change clears it. */
export function Toast({toast,onHide,ms=TOAST_MS}:{toast:ToastState|null;onHide:()=>void;ms?:number}){
 useEffect(()=>{if(!toast)return;const id=setTimeout(onHide,ms);return()=>clearTimeout(id)},[toast?.n,toast?.text,ms]);
 if(!toast)return null;
 return <div className="toast" role="status" aria-live="polite"><span>{toast.text}</span><button type="button" aria-label="Hinweis schließen" onClick={onHide}><X size={16}/></button></div>;
}
