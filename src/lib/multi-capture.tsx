import {t as tr} from './i18n';
import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Plus,Camera,Images,Check,RotateCw,AlertTriangle} from 'lucide-react';
import {createPendingMedia,type PendingMedia} from './handover-api';
import {CameraScreen,useObjectUrls} from './camera';
import {runUploads,toFile,MAX_BATCH,type UpItem} from './multi-upload';

/** Plus tile: continuous in-app camera or multi-select gallery, then one upload queue with per-file progress and retry. */
export function MultiCapture({disabled,sessionKey,send,onUploaded}:{disabled:boolean;sessionKey:string;send:(f:File)=>Promise<void>;onUploaded:()=>void}){
  const[menu,setMenu]=useState(false),[cam,setCam]=useState(false),[queue,setQueue]=useState<PendingMedia[]>([]),[st,setSt]=useState<Map<string,UpItem>>(new Map()),[busy,setBusy]=useState(false),[note,setNote]=useState('');
  const alive=useRef(true),status=useRef(new Map<string,UpItem>()),running=useRef(false),gen=useRef(0),fileEl=useRef<HTMLInputElement>(null);
  const urls=useObjectUrls(queue);
  const reset=()=>{gen.current++;status.current=new Map();running.current=false;setQueue([]);setSt(new Map());setBusy(false);setNote('');setCam(false);setMenu(false)};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;gen.current++}},[]);
  // account/booking switch: drop everything, nothing can leak into the next session
  useEffect(()=>{reset()},[sessionKey]);
  async function go(items:PendingMedia[]){
    if(running.current||!items.length)return;running.current=true;setBusy(true);setNote('');const my=gen.current;let any=false;
    await runUploads(items,status.current,async m=>{await send(toFile(m));any=true},s=>{if(my===gen.current)setSt(s)},()=>alive.current&&my===gen.current);
    if(my!==gen.current)return;running.current=false;setBusy(false);
    if(any)onUploaded();
    const left=items.filter(m=>status.current.get(m.id)?.status!=='done');
    if(!left.length){setQueue([]);status.current=new Map();setSt(new Map());setNote(tr("Gespeichert"))}else{setQueue(left);setNote(left.length+tr(" Medien nicht hochgeladen. Erneut versuchen."))}
  }
  function add(m:PendingMedia){setQueue(q=>q.length>=MAX_BATCH?q:[...q,m])}
  function onFiles(e:React.ChangeEvent<HTMLInputElement>){
    const files=Array.from(e.target.files||[]);e.target.value='';const room=MAX_BATCH-queue.length;const next:PendingMedia[]=[];const errs:string[]=[];
    for(const f of files.slice(0,Math.max(0,room))){try{next.push(createPendingMedia(f,'photo',f.name))}catch(er){errs.push(er instanceof Error?er.message:String(er))}}
    if(files.length>room)errs.push(tr("Maximal ")+MAX_BATCH+tr(" Medien."));
    setMenu(false);setNote(errs.join(' '));if(next.length){setQueue(q=>[...q,...next]);void go(next)}
  }
  const failed=queue.filter(m=>st.get(m.id)?.status==='failed').length;
  return <>
    <button type="button" className="upload" disabled={disabled||busy} aria-haspopup="dialog" onClick={()=>setMenu(true)}><Plus size={26}/><span className="sr-only">{tr("Medien hinzufügen")}</span></button>
    <input ref={fileEl} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={onFiles} aria-label={tr("Aus Galerie wählen")} tabIndex={-1}/>
    {menu&&createPortal(<div className="mc-sheet" role="dialog" aria-modal="true" aria-label={tr("Medien hinzufügen")} onClick={()=>setMenu(false)}><div onClick={e=>e.stopPropagation()}>
      <button type="button" onClick={()=>{setMenu(false);setCam(true)}}><Camera size={20}/> {tr("Kamera (mehrere Aufnahmen)")}</button>
      <button type="button" onClick={()=>fileEl.current?.click()}><Images size={20}/> {tr("Aus Galerie (mehrere)")}</button>
      <button type="button" className="mc-cancel" onClick={()=>setMenu(false)}>{tr("Abbrechen")}</button></div></div>,document.body)}
    {cam&&createPortal(<div className="ho"><CameraScreen title={tr("Medien")} photoOnly media={queue} onAdd={add} onRemove={id=>setQueue(q=>q.filter(m=>m.id!==id))} onBack={()=>reset()} onDone={()=>{setCam(false);void go(queue)}}/></div>,document.body)}
    {(queue.length>0||note)&&!cam&&<div className="mc-q" role="status">
      {queue.length>0&&<div className="mc-thumbs">{queue.map(m=>{const s=st.get(m.id)?.status||'queued';return <div key={m.id} className={'mc-t '+s} title={st.get(m.id)?.error}><img src={urls.get(m.id)} alt=""/><span>{s==='done'?<Check size={14}/>:s==='failed'?<AlertTriangle size={14}/>:s==='uploading'?'…':''}</span></div>})}</div>}
      {busy&&<p>{tr("Wird hochgeladen … ")}{queue.filter(m=>st.get(m.id)?.status==='done').length} / {queue.length}</p>}
      {note&&<p>{note}</p>}
      {!busy&&failed>0&&<button type="button" className="mc-retry" onClick={()=>void go(queue)}><RotateCw size={14}/> {tr("Erneut versuchen")}</button>}
      {!busy&&queue.length>0&&<button type="button" className="mc-retry" onClick={reset}>{tr("Verwerfen")}</button>}
    </div>}
  </>;
}
