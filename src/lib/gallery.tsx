import {t as tr} from './i18n';
import React,{useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {ChevronLeft,ChevronRight,Maximize,Minimize,Download,Share2,Camera,Video as VideoIcon,PenLine,Calendar,AlertTriangle} from 'lucide-react';
import {listBookingMedia,signedMediaUrl,mediaBlob,type MediaItem} from './handover-api';
import {pendingOfflineMedia,subscribeOffline,offlineSnapshot} from './offline-client';
import {useEdgeBack} from './use-edge-back';
import {Trash2} from 'lucide-react';
import {deleteBookingMedia,mediaDeleteEnabled} from './media-delete-api';
import {MediaDeleteDialog} from './media-delete-dialog';
import '../media-delete.css';

const RENEW_MS=240000;
const deletions=new EventTarget();
type DeletedMedia={account:string;bookingId:string;path:string};
type U={url:string;at:number;blob?:Blob};
const kindLabel=(k:MediaItem['kind'])=>k==='photo'?tr("Photo"):k==='video'?tr("Video"):k==='signature'?tr("Signature"):tr("Medien");
const fmt=(iso:string)=>{try{return new Date(iso).toLocaleString('de-DE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Berlin'})}catch{return iso}};
const ext=(m:MediaItem)=>{const t=m.mime_type||'';return t.includes('png')?'png':t.includes('mp4')?'mp4':t.includes('webm')?'webm':t.includes('quicktime')?'mov':t.startsWith('video')?'mp4':'jpg'};

export function useSignedUrls(){
  const[map,setMap]=useState<Record<string,U>>({}),[errs,setErrs]=useState<Record<string,string>>({}),inflight=useRef(new Map<string,Promise<void>>()),mapRef=useRef(map),forced=useRef(new Set<string>());mapRef.current=map;const retired=useRef(new Set<string>());const dead=useRef(false),owned=useRef(new Map<string,string>());
  useEffect(()=>{dead.current=false;return()=>{dead.current=true;for(const url of owned.current.values())URL.revokeObjectURL(url);owned.current.clear()}},[]);
  const setErr=(id:string,v:string|null)=>{if(!dead.current)setErrs(x=>{if(v===null){if(!(id in x))return x;const{[id]:_,...r}=x;return r}return{...x,[id]:v}})};
  const ensure=useCallback((m:MediaItem,force=false)=>{
    if(retired.current.has(m.id))return Promise.resolve();const c=mapRef.current[m.id];if(!force&&c&&c.blob===m.local_blob&&Date.now()-c.at<RENEW_MS)return Promise.resolve();
    const f=inflight.current.get(m.id);if(f)return f;
    const p=signedMediaUrl(m).then(url=>{if(!url)throw Error(tr("Keine Medien-URL erhalten."));if(dead.current||retired.current.has(m.id)){if(m.local_blob)URL.revokeObjectURL(url);return}const old=owned.current.get(m.id);if(old)URL.revokeObjectURL(old);owned.current.delete(m.id);if(m.local_blob)owned.current.set(m.id,url);setMap(x=>({...x,[m.id]:{url,at:Date.now(),blob:m.local_blob}}));setErr(m.id,null)}).catch(e=>{setErr(m.id,e instanceof Error?e.message:String(e))}).finally(()=>{inflight.current.delete(m.id)});
    inflight.current.set(m.id,p);return p},[]);
  // image/video element failed: renew the signed URL once, then show an error instead of looping
  const bad=useCallback((m:MediaItem)=>{if(forced.current.has(m.id)){setErr(m.id,tr("Medium konnte nicht geladen werden."));return}forced.current.add(m.id);void ensure(m,true)},[ensure]);
  const good=useCallback((m:MediaItem)=>{forced.current.delete(m.id);setErr(m.id,null)},[]);
  const retry=useCallback((m:MediaItem)=>{forced.current.delete(m.id);setErr(m.id,null);return ensure(m,true)},[ensure]);
  const evict=useCallback((id:string)=>{retired.current.add(id);const url=owned.current.get(id);if(url)URL.revokeObjectURL(url);owned.current.delete(id);forced.current.delete(id);delete mapRef.current[id];setMap(x=>{const{[id]:_,...rest}=x;return rest});setErrs(x=>{const{[id]:_,...rest}=x;return rest})},[]);
  const prune=useCallback((items:MediaItem[])=>{for(const id of Object.keys(mapRef.current))if(!items.some(i=>i.id===id))evict(id)},[evict]);
  return{map,errs,ensure,bad,good,retry,prune,evict};
}

type Undo={undone_at?:string|null;undone_by?:string|null};const undone=(m:MediaItem)=>(m as MediaItem&Undo).undone_at||null;
type GalleryProps={bookingId:string;demo:boolean;refreshKey:number;local:{name:string;url:string}[];canDelete?:boolean;addTile?:React.ReactNode};
/** Keyed by booking: items, open viewer, signed-URL cache and errors can never carry over to another booking, even if the parent forgets a key. */
export function MediaGallery(p:GalleryProps){const account=useSyncExternalStore(subscribeOffline,()=>String(offlineSnapshot().accountId||'')+':'+String(offlineSnapshot().ready),()=>':false');return <MediaGalleryInner key={account+':'+p.bookingId} {...p}/>}
function MediaGalleryInner({bookingId,demo,refreshKey,local,canDelete,addTile}:GalleryProps){
  const[items,setItems]=useState<MediaItem[]>([]),[err,setErr]=useState(''),[open,setOpen]=useState<number|null>(null),[loading,setLoading]=useState(false);
  const{map,errs,ensure,bad,good,retry,prune,evict}=useSignedUrls();const[reload,setReload]=useState(0);
  const offline=useSyncExternalStore(subscribeOffline,offlineSnapshot,offlineSnapshot);
  const removed=useRef(new Set<string>()),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
  const[serverItems,setServerItems]=useState<MediaItem[]>([]),[pending,setPending]=useState<MediaItem[]>([]);
  useEffect(()=>{const listener=(event:Event)=>{const detail=(event as CustomEvent<DeletedMedia>).detail;if(detail.account!==offlineSnapshot().accountId||detail.bookingId!==bookingId)return;removed.current.add(detail.path);for(const m of [...serverItems,...pending])if(m.path===detail.path)evict(m.id);setItems(x=>x.filter(m=>m.path!==detail.path));setServerItems(x=>x.filter(m=>m.path!==detail.path));setOpen(null)};deletions.addEventListener('removed',listener);return()=>deletions.removeEventListener('removed',listener)},[bookingId,serverItems,pending,evict]);
  useEffect(()=>{if(demo)return;let dead=false;
    pendingOfflineMedia(bookingId).then(rows=>{if(!dead)setPending(rows.map(({item,blob})=>({...item,local_blob:blob,offline_pending:true})))})
      .catch(e=>{if(!dead)setErr(e instanceof Error?e.message:String(e))});
    return()=>{dead=true};
  },[bookingId,demo,refreshKey,offline]);
  useEffect(()=>{if(demo)return;let dead=false;setLoading(true);setErr('');
    listBookingMedia(bookingId).then(l=>{if(!dead)setServerItems(l.filter(m=>!removed.current.has(m.path)))}).catch(e=>{if(!dead)setErr(e instanceof Error?e.message:String(e))}).finally(()=>{if(!dead)setLoading(false)});
    return()=>{dead=true}},[bookingId,refreshKey,reload,demo,offline.pending,offline.online]);
  useEffect(()=>{
    const merged=new Map(serverItems.map(m=>[m.id,m]));
    for(const m of pending)if(!merged.has(m.id))merged.set(m.id,m);
    const s=[...merged.values()].filter(m=>!removed.current.has(m.path)).sort((a,b)=>a.captured_at.localeCompare(b.captured_at));
    setItems(s);prune(s);s.filter(i=>i.kind!=='video').forEach(i=>void ensure(i));
  },[serverItems,pending,ensure,prune]);
  if(demo)return <div className="mg-grid">{addTile}{local.map(p=><a key={p.name} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={tr("Fahrzeugdokumentation")}/></a>)}</div>;
  return <div className="mg">
    {err&&<p className="mg-err" role="alert">{tr("Medien konnten nicht geladen werden:")}{err} <button type="button" className="mg-retry" onClick={()=>setReload(x=>x+1)}>{tr("Erneut versuchen")}</button></p>}
    {loading&&!items.length&&<p className="mg-note" role="status">{tr("Medien werden geladen …")}</p>}
    {!loading&&!err&&!items.length&&<p className="mg-note">{tr("Noch keine Medien.")}</p>}
    <div className="mg-grid">{addTile}{items.map((m,i)=><button type="button" key={m.id} className={'mg-tile'+(undone(m)?' undone':'')} aria-label={tr("Medium ")+(i+1)+' öffnen, '+kindLabel(m.kind)+(undone(m)?tr(", rückgängig gemacht"):'')} onClick={()=>setOpen(i)}>
      {m.kind==='video'?<span className="mg-ico"><VideoIcon size={22}/></span>:map[m.id]&&!errs[m.id]?<img src={map[m.id].url} alt="" onLoad={()=>good(m)} onError={()=>bad(m)}/>:<span className="mg-ico" title={errs[m.id]}>{errs[m.id]?<AlertTriangle size={22}/>:<Camera size={22}/>}</span>}<b>{i+1}</b>{m.offline_pending&&<span className="mg-undone">{tr("Ausstehend")}</span>}{undone(m)&&<span className="mg-undone">{tr("Rückgängig gemacht")}</span>}</button>)}</div>
    {open!==null&&items[open]&&<Viewer items={items} index={open} setIndex={setOpen} onClose={()=>setOpen(null)} map={map} errs={errs} ensure={ensure} bad={bad} good={good} retry={retry} onDelete={canDelete&&!demo&&mediaDeleteEnabled()?async(m,rid,reason)=>{const account=offlineSnapshot().accountId;await deleteBookingMedia({requestId:rid,bookingId,item:m,confirmed:true,reason});if(!alive.current||account!==offlineSnapshot().accountId)return;deletions.dispatchEvent(new CustomEvent<DeletedMedia>('removed',{detail:{account:account!,bookingId,path:m.path}}));setReload(x=>x+1)}:undefined}/>}
  </div>;
}

export function Viewer({items,index,setIndex,onClose,map,errs,ensure,bad,good,retry,onDelete}:{onDelete?:(m:MediaItem,requestId:string,reason:string)=>Promise<void>;items:MediaItem[];index:number;setIndex:(i:number)=>void;onClose:()=>void;map:Record<string,U>;errs:Record<string,string>;ensure:(m:MediaItem,f?:boolean)=>Promise<void>;bad:(m:MediaItem)=>void;good:(m:MediaItem)=>void;retry:(m:MediaItem)=>Promise<void>}){
  const m=items[index],box=useRef<HTMLDivElement>(null),[full,setFull]=useState(false),[msg,setMsg]=useState(''),[busy,setBusy]=useState('');
  const[confirm,setConfirm]=useState(false),[delErr,setDelErr]=useState(''),reasons=useRef(new Map<string,string>()),rids=useRef(new Map<string,string>()),offlineNow=useSyncExternalStore(subscribeOffline,()=>!offlineSnapshot().online,()=>false);
  const strip=useRef<HTMLDivElement>(null),root=useRef<HTMLDivElement>(null);
  useEdgeBack(root,{enabled:true,priority:60,blocked:!!busy||confirm,key:m.id,onBack:()=>{if(document.fullscreenElement){void document.exitFullscreen?.();return}if(full){setFull(false);return}onClose()}});
  useEffect(()=>{ensure(m);const o=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=o}},[]);
  useEffect(()=>{ensure(m);const t=window.setInterval(()=>ensure(m),30000);return()=>clearInterval(t)},[m,ensure]);
  useEffect(()=>{items.forEach(i=>{if(i.kind!=='video')ensure(i)});const st=strip.current,el=st?.children[index] as HTMLElement|undefined;if(st&&el){const left=el.offsetLeft-st.offsetLeft-(st.clientWidth-el.offsetWidth)/2;if(typeof st.scrollTo==='function')st.scrollTo({left:Math.max(0,left)});else st.scrollLeft=Math.max(0,left)}},[index]);
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(confirm)return;const t=e.target as HTMLElement|null;if(t&&(t.tagName==='VIDEO'||t.tagName==='INPUT'||t.tagName==='TEXTAREA'))return;if(e.key==='ArrowLeft')go(-1);else if(e.key==='ArrowRight')go(1);else if(e.key==='Escape'){if(document.fullscreenElement)return;if(full){setFull(false);return}onClose()}};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)});
  useEffect(()=>{const f=()=>setFull(!!document.fullscreenElement);document.addEventListener('fullscreenchange',f);return()=>document.removeEventListener('fullscreenchange',f)},[]);
  function go(d:number){if(confirm||busy)return;setMsg('');setIndex((index+d+items.length)%items.length)}
  async function toggleFull(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(box.current?.requestFullscreen)await box.current.requestFullscreen();else setFull(f=>!f)}catch{setFull(f=>!f)}}
  const name=()=>'tvp-'+(index+1)+'-'+m.captured_at.slice(0,10)+'.'+ext(m);
  async function download(){setBusy('dl');setMsg('');try{const b=await mediaBlob(m);const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name();document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}catch(e){setMsg(tr("Download fehlgeschlagen: ")+(e instanceof Error?e.message:String(e)))}finally{setBusy('')}}
  async function share(){setBusy('sh');setMsg('');try{const b=await mediaBlob(m);const f=new File([b],name(),{type:b.type||m.mime_type});if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f]});else setMsg(tr("Teilen wird von diesem Gerät nicht unterstützt. Bitte Download nutzen."))}catch(e){if((e as DOMException)?.name!=='AbortError')setMsg(tr("Teilen fehlgeschlagen: ")+(e instanceof Error?e.message:String(e)))}finally{setBusy('')}}
  async function doDelete(reason:string){if(offlineNow)return;reasons.current.set(m.id,reason);setBusy('del');setDelErr('');let rid=rids.current.get(m.id);if(!rid){rid=crypto.randomUUID();rids.current.set(m.id,rid)}try{await onDelete!(m,rid,reason);rids.current.delete(m.id);setConfirm(false)}catch(e){setDelErr(e instanceof Error?e.message:String(e))}finally{setBusy('')}}
  const canDel=!!onDelete&&!m.offline_pending&&!m.local_blob;
  const canShare=typeof navigator!=='undefined'&&typeof navigator.share==='function'&&typeof navigator.canShare==='function';
  const u=map[m.id]?.url;
  const e=errs[m.id];
  return <div ref={root} className={'gv'+(full?' full':'')} role="dialog" aria-modal="true" aria-label={tr("Medien")}>
    <header className="gv-head"><button type="button" className="gv-round" aria-label={tr("Schließen")} onClick={onClose}><ChevronLeft size={22}/></button><h2>{tr("Existing media")}</h2><span/></header>
    <div className="gv-card"><div className={'gv-stage'+(m.kind==='photo'?' is-photo':'')} ref={box}>
      <div className="gv-frame">{e?<div className="gv-load err" role="alert"><p>{e}</p><button type="button" className="gv-retry" onClick={()=>void retry(m)}>{tr("Erneut versuchen")}</button></div>:!u?<p className="gv-load" role="status">{tr("Wird geladen …")}</p>:m.kind==='video'?<video data-edge-back-exclude key={m.id+u.slice(-12)} src={u} controls playsInline preload="metadata" onLoadedMetadata={()=>good(m)} onError={()=>bad(m)}/>:<img key={m.id} src={u} alt={kindLabel(m.kind)+' '+(index+1)} onLoad={()=>good(m)} onError={()=>bad(m)} className={m.kind==='signature'?'sig-img':''}/>}</div>
      <span className="gv-count">{index+1} {"/"}{items.length}</span>
      <button type="button" className="gv-fs" aria-label={full?tr("Vollbild beenden"):tr("Vollbild")} onClick={toggleFull}>{full?<Minimize size={18}/>:<Maximize size={18}/>}</button>
      {items.length>1&&<><button type="button" className="gv-nav l" aria-label={tr("Zurück")} onClick={()=>go(-1)}><ChevronLeft size={22}/></button><button type="button" className="gv-nav r" aria-label={tr("Weiter")} onClick={()=>go(1)}><ChevronRight size={22}/></button></>}
    </div></div>
    <div className="gv-meta"><div className="gv-pills"><span>{m.kind==='photo'?<Camera size={14}/>:m.kind==='video'?<VideoIcon size={14}/>:<PenLine size={14}/>} {kindLabel(m.kind)}</span><span><Calendar size={14}/> {fmt(m.captured_at)}</span>{m.offline_pending&&<span>{tr("Ausstehend")}</span>}{m.action&&<span>{m.action==='in'?tr("Check-in"):tr("Check-out")}</span>}{undone(m)&&<span>{tr("Rückgängig gemacht ·")}{fmt(undone(m)!)}</span>}</div>
      <div className="gv-acts">{canShare&&<button type="button" className="gv-round" aria-label={tr("Teilen")} disabled={!!busy} onClick={share}><Share2 size={18}/></button>}{canDel&&<button type="button" className="gv-round gv-del" aria-label={tr("Löschen")} disabled={!!busy} onClick={()=>{setDelErr('');setConfirm(true)}}><Trash2 size={18}/></button>}<button type="button" className="gv-round" aria-label={tr("Herunterladen")} disabled={!!busy} onClick={download}><Download size={18}/></button></div></div>
    {confirm&&canDel&&<MediaDeleteDialog initialReason={reasons.current.get(m.id)} locked={rids.current.has(m.id)} item={m} busy={busy==='del'} error={delErr} blocked={offlineNow?tr("Offline: Löschen ist nur online möglich."):''} onCancel={()=>{setConfirm(false);setDelErr('')}} onConfirm={reason=>void doDelete(reason)}/>}
    {msg&&<p className="gv-msg" role="alert">{msg}</p>}
    <h3 className="gv-title">{tr("Media (")}{items.filter(i=>i.kind==='photo').length} {tr("photos")}{items.some(i=>i.kind==='video')?', '+items.filter(i=>i.kind==='video').length+' videos':''}{")"}</h3>
    <div className="gv-strip" ref={strip} data-edge-back-exclude>{items.map((i,n)=><button type="button" key={i.id} className={n===index?'on':''} aria-label={tr("Medium ")+(n+1)} aria-current={n===index} disabled={confirm||!!busy} onClick={()=>{setMsg('');setIndex(n)}}>{i.kind==='video'?<span><VideoIcon size={20}/></span>:map[i.id]&&!errs[i.id]?<img src={map[i.id].url} alt="" loading="lazy" onLoad={()=>good(i)} onError={()=>bad(i)}/>:<span title={errs[i.id]}>{errs[i.id]?<AlertTriangle size={20}/>:<Camera size={20}/>}</span>}<b>{n+1}</b></button>)}</div>
  </div>;
}
