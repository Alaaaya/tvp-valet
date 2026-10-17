import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Maximize2,Minimize2,Download,Share2,Camera,Video as VideoIcon,PenLine,Calendar,AlertTriangle} from 'lucide-react';
import {listBookingMedia,signedMediaUrl,mediaBlob,type MediaItem} from './handover-api';

const RENEW_MS=240000;
type U={url:string;at:number};
const kindLabel=(k:MediaItem['kind'])=>k==='photo'?'Photo':k==='video'?'Video':'Signature';
const fmt=(iso:string)=>{try{return new Date(iso).toLocaleString('de-DE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'})}catch{return iso}};
const ext=(m:MediaItem)=>{const t=m.mime_type||'';return t.includes('png')?'png':t.includes('mp4')?'mp4':t.includes('webm')?'webm':t.includes('quicktime')?'mov':t.startsWith('video')?'mp4':'jpg'};

export function useSignedUrls(){
  const[map,setMap]=useState<Record<string,U>>({}),[errs,setErrs]=useState<Record<string,string>>({}),inflight=useRef(new Map<string,Promise<void>>()),mapRef=useRef(map),forced=useRef(new Set<string>());mapRef.current=map;const dead=useRef(false);
  useEffect(()=>{dead.current=false;return()=>{dead.current=true}},[]);
  const setErr=(id:string,v:string|null)=>{if(!dead.current)setErrs(x=>{if(v===null){if(!(id in x))return x;const{[id]:_,...r}=x;return r}return{...x,[id]:v}})};
  const ensure=useCallback((m:MediaItem,force=false)=>{
    const c=mapRef.current[m.id];if(!force&&c&&Date.now()-c.at<RENEW_MS)return Promise.resolve();
    const f=inflight.current.get(m.id);if(f)return f;
    const p=signedMediaUrl(m).then(url=>{if(!url)throw Error('Keine Medien-URL erhalten.');if(!dead.current)setMap(x=>({...x,[m.id]:{url,at:Date.now()}}));setErr(m.id,null)}).catch(e=>{setErr(m.id,e instanceof Error?e.message:String(e))}).finally(()=>{inflight.current.delete(m.id)});
    inflight.current.set(m.id,p);return p},[]);
  // image/video element failed: renew the signed URL once, then show an error instead of looping
  const bad=useCallback((m:MediaItem)=>{if(forced.current.has(m.id)){setErr(m.id,'Medium konnte nicht geladen werden.');return}forced.current.add(m.id);void ensure(m,true)},[ensure]);
  const good=useCallback((m:MediaItem)=>{forced.current.delete(m.id);setErr(m.id,null)},[]);
  const retry=useCallback((m:MediaItem)=>{forced.current.delete(m.id);setErr(m.id,null);return ensure(m,true)},[ensure]);
  return{map,errs,ensure,bad,good,retry};
}

type Undo={undone_at?:string|null;undone_by?:string|null};const undone=(m:MediaItem)=>(m as MediaItem&Undo).undone_at||null;
export function MediaGallery({bookingId,demo,refreshKey,local,addTile}:{bookingId:string;demo:boolean;refreshKey:number;local:{name:string;url:string}[];addTile?:React.ReactNode}){
  const[items,setItems]=useState<MediaItem[]>([]),[err,setErr]=useState(''),[open,setOpen]=useState<number|null>(null),[loading,setLoading]=useState(false);
  const{map,errs,ensure,bad,good,retry}=useSignedUrls();const[reload,setReload]=useState(0);
  useEffect(()=>{if(demo)return;let dead=false;setLoading(true);setErr('');
    listBookingMedia(bookingId).then(l=>{if(dead)return;const s=[...l].sort((a,b)=>a.captured_at.localeCompare(b.captured_at));setItems(s);s.filter(i=>i.kind!=='video').forEach(i=>ensure(i))}).catch(e=>{if(!dead)setErr(e instanceof Error?e.message:String(e))}).finally(()=>{if(!dead)setLoading(false)});
    return()=>{dead=true}},[bookingId,refreshKey,reload,demo,ensure]);
  if(demo)return <div className="mg-grid">{addTile}{local.map(p=><a key={p.name} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="Fahrzeugdokumentation"/></a>)}</div>;
  return <div className="mg">
    {err&&<p className="mg-err" role="alert">Medien konnten nicht geladen werden: {err} <button type="button" className="mg-retry" onClick={()=>setReload(x=>x+1)}>Erneut versuchen</button></p>}
    {loading&&!items.length&&<p className="mg-note" role="status">Medien werden geladen …</p>}
    {!loading&&!err&&!items.length&&<p className="mg-note">Noch keine Medien.</p>}
    <div className="mg-grid">{addTile}{items.map((m,i)=><button type="button" key={m.id} className={'mg-tile'+(undone(m)?' undone':'')} aria-label={'Medium '+(i+1)+' öffnen, '+kindLabel(m.kind)+(undone(m)?', rückgängig gemacht':'')} onClick={()=>setOpen(i)}>
      {m.kind==='video'?<span className="mg-ico"><VideoIcon size={22}/></span>:map[m.id]&&!errs[m.id]?<img src={map[m.id].url} alt="" onLoad={()=>good(m)} onError={()=>bad(m)}/>:<span className="mg-ico" title={errs[m.id]}>{errs[m.id]?<AlertTriangle size={22}/>:<Camera size={22}/>}</span>}<b>{i+1}</b>{undone(m)&&<span className="mg-undone">Rückgängig gemacht</span>}</button>)}</div>
    {open!==null&&items[open]&&<Viewer items={items} index={open} setIndex={setOpen} onClose={()=>setOpen(null)} map={map} errs={errs} ensure={ensure} bad={bad} good={good} retry={retry}/>}
  </div>;
}

function Viewer({items,index,setIndex,onClose,map,errs,ensure,bad,good,retry}:{items:MediaItem[];index:number;setIndex:(i:number)=>void;onClose:()=>void;map:Record<string,U>;errs:Record<string,string>;ensure:(m:MediaItem,f?:boolean)=>Promise<void>;bad:(m:MediaItem)=>void;good:(m:MediaItem)=>void;retry:(m:MediaItem)=>Promise<void>}){
  const m=items[index],box=useRef<HTMLDivElement>(null),[full,setFull]=useState(false),[msg,setMsg]=useState(''),[busy,setBusy]=useState('');
  const strip=useRef<HTMLDivElement>(null);
  useEffect(()=>{ensure(m);const o=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=o}},[]);
  useEffect(()=>{ensure(m);const t=window.setInterval(()=>ensure(m),30000);return()=>clearInterval(t)},[m,ensure]);
  useEffect(()=>{items.forEach(i=>{if(i.kind!=='video')ensure(i)});const el=strip.current?.children[index] as HTMLElement|undefined;el?.scrollIntoView?.({inline:'center',block:'nearest'})},[index]);
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='ArrowLeft')go(-1);else if(e.key==='ArrowRight')go(1);else if(e.key==='Escape')onClose()};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)});
  useEffect(()=>{const f=()=>setFull(!!document.fullscreenElement);document.addEventListener('fullscreenchange',f);return()=>document.removeEventListener('fullscreenchange',f)},[]);
  function go(d:number){setMsg('');setIndex((index+d+items.length)%items.length)}
  async function toggleFull(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(box.current?.requestFullscreen)await box.current.requestFullscreen();else setFull(f=>!f)}catch{setFull(f=>!f)}}
  const name=()=>'tvp-'+(index+1)+'-'+m.captured_at.slice(0,10)+'.'+ext(m);
  async function download(){setBusy('dl');setMsg('');try{const b=await mediaBlob(m);const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name();document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}catch(e){setMsg('Download fehlgeschlagen: '+(e instanceof Error?e.message:String(e)))}finally{setBusy('')}}
  async function share(){setBusy('sh');setMsg('');try{const b=await mediaBlob(m);const f=new File([b],name(),{type:b.type||m.mime_type});if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f]});else setMsg('Teilen wird von diesem Gerät nicht unterstützt. Bitte Download nutzen.')}catch(e){if((e as DOMException)?.name!=='AbortError')setMsg('Teilen fehlgeschlagen: '+(e instanceof Error?e.message:String(e)))}finally{setBusy('')}}
  const canShare=typeof navigator!=='undefined'&&typeof navigator.share==='function'&&typeof navigator.canShare==='function';
  const u=map[m.id]?.url;
  const e=errs[m.id];
  return <div className={'gv'+(full?' full':'')} role="dialog" aria-modal="true" aria-label="Medien">
    <header className="gv-head"><button type="button" className="gv-round" aria-label="Schließen" onClick={onClose}><ChevronLeft size={22}/></button><h2>Existing media</h2><span/></header>
    <div className="gv-stage" ref={box}>
      <div className="gv-frame">{e?<div className="gv-load err" role="alert"><p>{e}</p><button type="button" className="gv-retry" onClick={()=>void retry(m)}>Erneut versuchen</button></div>:!u?<p className="gv-load" role="status">Wird geladen …</p>:m.kind==='video'?<video key={m.id+u.slice(-12)} src={u} controls playsInline preload="metadata" onLoadedMetadata={()=>good(m)} onError={()=>bad(m)}/>:<img key={m.id} src={u} alt={kindLabel(m.kind)+' '+(index+1)} onLoad={()=>good(m)} onError={()=>bad(m)} className={m.kind==='signature'?'sig-img':''}/>}</div>
      <span className="gv-count">{index+1} / {items.length}</span>
      <button type="button" className="gv-fs" aria-label={full?'Vollbild beenden':'Vollbild'} onClick={toggleFull}>{full?<Minimize2 size={18}/>:<Maximize2 size={18}/>}</button>
      {items.length>1&&<><button type="button" className="gv-nav l" aria-label="Zurück" onClick={()=>go(-1)}><ChevronLeft size={22}/></button><button type="button" className="gv-nav r" aria-label="Weiter" onClick={()=>go(1)}><ChevronRight size={22}/></button></>}
    </div>
    <div className="gv-meta"><div className="gv-pills"><span>{m.kind==='photo'?<Camera size={14}/>:m.kind==='video'?<VideoIcon size={14}/>:<PenLine size={14}/>} {kindLabel(m.kind)}</span><span><Calendar size={14}/> {fmt(m.captured_at)}</span>{m.action&&<span>{m.action==='in'?'Check-in':'Check-out'}</span>}{undone(m)&&<span>Rückgängig gemacht · {fmt(undone(m)!)}</span>}</div>
      <div className="gv-acts">{canShare&&<button type="button" className="gv-round" aria-label="Teilen" disabled={!!busy} onClick={share}><Share2 size={18}/></button>}<button type="button" className="gv-round" aria-label="Herunterladen" disabled={!!busy} onClick={download}><Download size={18}/></button></div></div>
    {msg&&<p className="gv-msg" role="alert">{msg}</p>}
    <h3 className="gv-title">Media ({items.filter(i=>i.kind==='photo').length} photos{items.some(i=>i.kind==='video')?', '+items.filter(i=>i.kind==='video').length+' videos':''})</h3>
    <div className="gv-strip" ref={strip}>{items.map((i,n)=><button type="button" key={i.id} className={n===index?'on':''} aria-label={'Medium '+(n+1)} aria-current={n===index} onClick={()=>{setMsg('');setIndex(n)}}>{i.kind==='video'?<span><VideoIcon size={20}/></span>:map[i.id]&&!errs[i.id]?<img src={map[i.id].url} alt="" loading="lazy" onLoad={()=>good(i)} onError={()=>bad(i)}/>:<span title={errs[i.id]}>{errs[i.id]?<AlertTriangle size={20}/>:<Camera size={20}/>}</span>}<b>{n+1}</b></button>)}</div>
  </div>;
}
