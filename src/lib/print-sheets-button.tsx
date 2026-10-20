import {useEffect,useState} from 'react';
import {Printer} from 'lucide-react';
import {t as tr} from './i18n';
import type {Booking} from '../model';

type ShareNav=Navigator&{canShare?:(d:{files:File[]})=>boolean};
type Outcome='done'|'needs-tap';
function download(file:File){
 const url=URL.createObjectURL(file),a=document.createElement('a');
 a.href=url;a.download=file.name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
/** Native iOS share sheet includes Print/Save. Retry is an explicit fresh gesture, never a popup. */
export async function deliverPdf(file:File,nav:ShareNav=navigator,touch=typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches):Promise<Outcome>{
 if(touch&&typeof nav.share==='function'&&nav.canShare?.({files:[file]})){
  try{await nav.share({files:[file],title:file.name});return 'done'}
  catch(e){const n=(e as {name?:string})?.name;if(n==='AbortError')return 'done';if(n==='NotAllowedError')return 'needs-tap'}
 }
 download(file);return 'done';
}
export function PrintSheetsButton({items,date,onDone,onError,detail=false}:{items:readonly {b:Booking}[];date:string;onDone:()=>void;onError:(m:string)=>void;detail?:boolean}){
 const[busy,setBusy]=useState(false),[ready,setReady]=useState<File|null>(null);
 // A ready PDF must never leak from an old date/filter or a different booking after navigation.
 const identity=date+'|'+items.map(({b})=>JSON.stringify(b)).join('|');
 useEffect(()=>{setReady(null)},[identity]);
 const finish=(o:Outcome,f:File)=>{if(o==='needs-tap')setReady(f);else{setReady(null);onDone()}};
 const click=async()=>{
  if(busy)return;
  setBusy(true);
  try{
   if(ready){finish(await deliverPdf(ready),ready);return}
   const m=await import('./print-sheets'),f=await m.sheetsPdfFile(items,date);
   finish(await deliverPdf(f),f);
  }catch(e){onError(tr("PDF konnte nicht erstellt werden")+(e instanceof Error&&e.message?': '+e.message:''))}
  finally{setBusy(false)}
 };
 const count=new Set(items.map(i=>i.b.id)).size;
 const label=detail?tr("Drucken"):tr("Alle Buchungen drucken")+' · '+date.split('-').reverse().join('.')+' ('+count+')';
 return <button type="button" className={detail?'bd-outline':'drawer-action'} disabled={!items.length||busy} aria-busy={busy} onClick={click}><Printer size={detail?16:20}/><span>{busy?tr("PDF wird erstellt …"):ready?tr("PDF öffnen"):label}</span></button>;
}
