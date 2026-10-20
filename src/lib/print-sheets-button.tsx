import {useState} from 'react';
import {FileText} from 'lucide-react';
import {t as tr} from './i18n';
import type {Booking} from '../model';

type ShareNav=Navigator&{canShare?:(d:{files:File[]})=>boolean};
type Outcome='done'|'needs-tap';

function download(file:File){
 const url=URL.createObjectURL(file);const a=document.createElement('a');
 a.href=url;a.download=file.name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
/** iOS/Android: the share sheet offers Print / Save to Files. Desktop: plain download. */
export async function deliverPdf(file:File,nav:ShareNav=navigator,touch=typeof matchMedia==='function'&&matchMedia('(pointer:coarse)').matches):Promise<Outcome>{
 if(touch&&typeof nav.share==='function'&&nav.canShare?.({files:[file]})){
  try{await nav.share({files:[file],title:file.name});return 'done'}
  catch(e){const n=(e as {name?:string})?.name;if(n==='AbortError')return 'done';if(n==='NotAllowedError')return 'needs-tap'}
 }
 download(file);return 'done';
}

/** Drawer button: builds one A4 sheet per booking of the visible day list. The PDF module loads on click. */
export function PrintSheetsButton({items,date,onDone,onError}:{items:readonly {b:Booking}[];date:string;onDone:()=>void;onError:(m:string)=>void}){
 const[busy,setBusy]=useState(false),[ready,setReady]=useState<File|null>(null);
 const finish=(o:Outcome,f:File)=>{if(o==='needs-tap')setReady(f);else{setReady(null);onDone()}};
 const click=async()=>{
  if(busy)return;
  // Second tap keeps the user gesture for the share sheet when the first one timed out.
  if(ready){const f=ready;finish(await deliverPdf(f),f);return}
  setBusy(true);
  try{const m=await import('./print-sheets');const f=await m.sheetsPdfFile(items,date);finish(await deliverPdf(f),f)}
  catch(e){onError(tr("PDF konnte nicht erstellt werden")+(e instanceof Error&&e.message?': '+e.message:''))}
  finally{setBusy(false)}
 };
 return <button className="drawer-action" disabled={!items.length||busy} aria-busy={busy} onClick={click}><FileText size={20}/><span>{busy?tr("PDF wird erstellt …"):ready?tr("PDF öffnen"):tr("Buchungsblätter drucken (PDF)")}</span></button>;
}
