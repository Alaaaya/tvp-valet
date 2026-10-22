import {t as tr} from './i18n';
import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {ChevronLeft,Zap,ZapOff,Minus,Plus,Video as VideoIcon} from 'lucide-react';
import {createPendingMedia,type PendingMedia} from './handover-api';
import {acquireCamera,releaseCamera} from './camera-stream';

import {MAX_VIDEO_SECONDS,MAX_VIDEO_BYTES,validateVideoSize,validateFallbackVideo} from './camera-validation';
export {MAX_VIDEO_SECONDS,MAX_VIDEO_BYTES} from './camera-validation';
export const MAX_MEDIA=40;
const VIDEO_TYPES=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
export function pickVideoMime(rec:{isTypeSupported?:(t:string)=>boolean}|undefined):string|null{
  if(!rec||typeof rec.isTypeSupported!=='function')return null;
  for(const t of VIDEO_TYPES)if(rec.isTypeSupported(t))return t;return '';
}
type Caps={zoom?:{min:number;max:number;step?:number};torch?:boolean};
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');

export function useObjectUrls(media:PendingMedia[]){
  const cache=useRef(new Map<string,string>());
  const urls=useMemo(()=>{const m=new Map<string,string>();for(const x of media){let u=cache.current.get(x.id);if(!u){u=URL.createObjectURL(x.blob);cache.current.set(x.id,u)}m.set(x.id,u)}
    for(const [id,u] of Array.from(cache.current)) if(!m.has(id)){URL.revokeObjectURL(u);cache.current.delete(id)}return m},[media]);
  useEffect(()=>()=>{cache.current.forEach(u=>URL.revokeObjectURL(u));cache.current.clear()},[]);
  return urls;
}

export function CameraScreen({media,onAdd,onRemove,onBack,onDone,title}:{media:PendingMedia[];onAdd:(m:PendingMedia)=>void;onRemove:(id:string)=>void;onBack:()=>void;onDone:()=>void;title:string}){
  const videoEl=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),rec=useRef<MediaRecorder|null>(null),chunks=useRef<Blob[]>([]),bytes=useRef(0),timer=useRef<number|undefined>(undefined),discard=useRef(false),fileEl=useRef<HTMLInputElement>(null),mounted=useRef(true),gen=useRef(0),finalizingRef=useRef(false);
  const[mode,setMode]=useState<'photo'|'video'>('photo'),[ready,setReady]=useState(false),[fallback,setFallback]=useState(false),[err,setErr]=useState(''),[caps,setCaps]=useState<Caps>({}),[zoom,setZoom]=useState(1),[torch,setTorch]=useState(false),[recording,setRecording]=useState(false),[finalizing,setFinalizing]=useState(false),[secs,setSecs]=useState(0),[note,setNote]=useState(''),[hasAudio,setHasAudio]=useState(false),[shown,setShown]=useState(false);
  const stageEl=useRef<HTMLDivElement>(null);
  // Size the preview to cover the stage with the frame's own aspect ratio (iOS can render a
  // rotated camera stream letterboxed/small when relying on object-fit alone).
  const fit=useCallback(()=>{const v=videoEl.current,st=stageEl.current;if(!v||!st)return;const W=st.clientWidth,H=st.clientHeight,vw=v.videoWidth,vh=v.videoHeight;
    if(!W||!H||!vw||!vh){v.style.width='';v.style.height='';return}const k=Math.max(W/vw,H/vh);v.style.width=Math.ceil(vw*k)+'px';v.style.height=Math.ceil(vh*k)+'px'},[]);
  useEffect(()=>{const st=stageEl.current;window.addEventListener('resize',fit);window.addEventListener('orientationchange',fit);let ro:ResizeObserver|undefined;
    if(st&&typeof ResizeObserver!=='undefined'){ro=new ResizeObserver(fit);ro.observe(st)}
    return()=>{window.removeEventListener('resize',fit);window.removeEventListener('orientationchange',fit);ro?.disconnect()}},[fit]);
  const urls=useObjectUrls(media);const markReady=()=>{const v=videoEl.current;fit();if(stream.current&&v&&v.videoWidth>0)setReady(true)};
  // Full-size by CSS from the start; stays invisible (black stage) until the first real frame, so the
  // user never sees an intrinsic-size/small preview box.
  const reveal=()=>{const v=videoEl.current;if(!stream.current||!v)return;markReady();setShown(true)};
  const watchFirstFrame=(v:HTMLVideoElement)=>{const rv=(v as any).requestVideoFrameCallback;if(typeof rv==='function'){try{rv.call(v,()=>reveal())}catch{/* events still reveal */}}};
  const full=media.length>=MAX_MEDIA;
  const canRecord=typeof MediaRecorder!=='undefined'&&pickVideoMime(MediaRecorder)!==null&&pickVideoMime(MediaRecorder)!=='';

  // Detach and release: the last release stops all tracks immediately (camera-stream.ts).
  const stopStream=useCallback(()=>{const v=videoEl.current;if(v){try{v.pause()}catch{}v.srcObject=null}if(stream.current){stream.current=null;releaseCamera()}setReady(false);setShown(false)},[]);
  const stopRecorder=useCallback((drop:boolean)=>{
    window.clearInterval(timer.current);const r=rec.current;
    if(drop){discard.current=true;chunks.current=[];finalizingRef.current=false;if(mounted.current){setFinalizing(false);setRecording(false)}}
    if(r&&r.state!=='inactive'){
      if(!drop){finalizingRef.current=true;if(mounted.current)setFinalizing(true)}
      try{r.stop()}catch{rec.current=null;chunks.current=[];finalizingRef.current=false;if(mounted.current){setFinalizing(false);setRecording(false);setNote(tr("Videoaufnahme konnte nicht abgeschlossen werden."))}}
    }
  },[]);

  const start=useCallback(async()=>{
    const my=++gen.current;
    if(!navigator.mediaDevices?.getUserMedia){setFallback(true);setErr(tr("Live-Kamera wird von diesem Browser nicht unterstützt. Aufnahme über die Kamera-App."));return}
    stopStream();
    let s:MediaStream;
    try{s=await acquireCamera()}
    catch(e){if(my!==gen.current||!mounted.current)return;setFallback(true);const n=(e as DOMException)?.name;setErr(n==='NotAllowedError'||n==='SecurityError'?tr("Kamerazugriff verweigert. Aufnahme stattdessen über die Kamera-App."):tr("Kamera nicht verfügbar. Aufnahme stattdessen über die Kamera-App."));return}
    if(my!==gen.current||!mounted.current){releaseCamera();return}
    stream.current=s;
    // Attach and start playback first (synchronously after the stream resolves); capabilities,
    // state updates and sizing come after, so nothing delays the first frame.
    const v=videoEl.current;let playing:Promise<void>|undefined;
    if(v){v.muted=true;v.srcObject=s;watchFirstFrame(v);try{playing=v.play()}catch{playing=Promise.reject()}}
    setHasAudio(s.getAudioTracks().length>0);setFallback(false);setErr('');
    const track=s.getVideoTracks()[0];let c:Caps={};
    try{const raw=(track.getCapabilities?.()||{}) as any;if(raw.zoom&&raw.zoom.max>raw.zoom.min)c.zoom={min:raw.zoom.min,max:raw.zoom.max,step:raw.zoom.step};if(raw.torch)c.torch=true}catch{}
    setCaps(c);setZoom(c.zoom?Math.max(c.zoom.min,1):1);setTorch(false);
    if(playing){try{await playing}catch{if(my===gen.current)setNote(tr("Vorschau konnte nicht gestartet werden."))}}
    if(my===gen.current&&v&&v.videoWidth>0&&v.readyState>=2)setReady(true);
    fit();
  },[stopStream]);

  // Layout effect: join/start getUserMedia during commit, before the first paint (not after it).
  useLayoutEffect(()=>{mounted.current=true;start();
    // Hidden: finish a running recording but keep the stream (stopping it makes iOS ask again).
    // Visible: resume the preview, or re-acquire only if iOS ended the track meanwhile.
    const vis=()=>{if(document.visibilityState==='hidden'){stopRecorder(false)}else if(!fallbackRef.current){const s=stream.current;if(!s||!s.getVideoTracks().some(t=>t.readyState==='live'))start();else{const v=videoEl.current;if(v&&v.paused)v.play().catch(()=>{})}}};
    document.addEventListener('visibilitychange',vis);
    return()=>{mounted.current=false;gen.current++;document.removeEventListener('visibilitychange',vis);stopRecorder(true);stopStream()}},[]);
  const fallbackRef=useRef(false);fallbackRef.current=fallback;

  async function applyZoom(z:number){if(!caps.zoom||!stream.current)return;const v=Math.min(caps.zoom.max,Math.max(caps.zoom.min,z));setZoom(v);try{await stream.current.getVideoTracks()[0].applyConstraints({advanced:[{zoom:v} as any]})}catch{setNote(tr("Zoom wird vom Gerät nicht angenommen."))}}
  async function toggleTorch(){if(!caps.torch||!stream.current)return;const n=!torch;try{await stream.current.getVideoTracks()[0].applyConstraints({advanced:[{torch:n} as any]});setTorch(n)}catch{setNote(tr("Blitz wird vom Gerät nicht angenommen."))}}

  function take(){
    if(full){setNote(tr("Maximal ")+MAX_MEDIA+tr(" Medien."));return}
    const v=videoEl.current;if(!v||!ready||!v.videoWidth)return;
    const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d')!.drawImage(v,0,0);
    c.toBlob(b=>{if(!mounted.current)return;if(!b){setNote(tr("Foto konnte nicht erstellt werden."));return}
      if(b.size>10*1024*1024){setNote(tr("Foto ist größer als 10 MB."));return}
      try{onAdd(createPendingMedia(b,'photo','photo-'+stamp()+'.jpg'));setNote('')}catch(e){setNote(e instanceof Error?e.message:String(e))}},'image/jpeg',.9);
  }

  async function toggleRecord(){
    if(finalizingRef.current)return;
    if(recording){stopRecorder(false);return}
    if(full){setNote(tr("Maximal ")+MAX_MEDIA+tr(" Medien."));return}
    if(!canRecord){setNote(tr("Videoaufnahme wird in diesem Browser nicht unterstützt."));return}
    if(!stream.current)return;
    const mime=pickVideoMime(MediaRecorder)!;chunks.current=[];bytes.current=0;discard.current=false;
    let r:MediaRecorder;try{r=new MediaRecorder(stream.current,{mimeType:mime})}catch{try{r=new MediaRecorder(stream.current)}catch{setNote(tr("Videoaufnahme konnte nicht gestartet werden."));return}}
    rec.current=r;
    r.onerror=ev=>{window.clearInterval(timer.current);discard.current=true;r.ondataavailable=null;r.onstop=null;try{if(r.state!=='inactive')r.stop()}catch{}rec.current=null;chunks.current=[];finalizingRef.current=false;if(mounted.current){setFinalizing(false);setRecording(false);setNote(tr("Videoaufnahme fehlgeschlagen")+((ev as any)?.error?.message?': '+(ev as any).error.message:'')+'.')}};
    r.ondataavailable=e=>{if(e.data&&e.data.size){chunks.current.push(e.data);bytes.current+=e.data.size;if(bytes.current>=MAX_VIDEO_BYTES&&r.state==='recording'){setNote(tr("Video auf 45 MB begrenzt."));stopRecorder(false)}}};
    r.onstop=()=>{window.clearInterval(timer.current);const drop=discard.current;const type=(r.mimeType||mime||'video/webm').split(';')[0];const parts=chunks.current;chunks.current=[];
      try{if(drop||!parts.length||!mounted.current)return;const blob=new Blob(parts,{type});validateVideoSize(blob.size);onAdd(createPendingMedia(blob,'video','video-'+stamp()+'.'+(type.includes('mp4')?'mp4':'webm')))}
      catch(e){if(mounted.current)setNote(e instanceof Error?e.message:String(e))}
      finally{rec.current=null;finalizingRef.current=false;if(mounted.current){setFinalizing(false);setRecording(false)}}};
    try{r.start(1000)}catch(e){rec.current=null;setNote(tr("Videoaufnahme konnte nicht gestartet werden")+(e instanceof Error&&e.message?': '+e.message:'')+'.');return}
    setRecording(true);setSecs(0);const t0=Date.now();
    timer.current=window.setInterval(()=>{const s=Math.floor((Date.now()-t0)/1000);setSecs(s);if(s>=MAX_VIDEO_SECONDS&&r.state==='recording'){setNote(tr("Video auf 120 Sekunden begrenzt."));stopRecorder(false)}},500);
  }

  async function chooseMode(m:'photo'|'video'){
    if(recording||finalizingRef.current||m===mode)return;setMode(m);setNote('');
    if(fallback)return;
    if(m==='video'&&!canRecord){setNote(tr("Videoaufnahme wird in diesem Browser nicht unterstützt."));return}
    // Same stream for photo and video: no new getUserMedia, no new permission prompt.
  }

  async function onFiles(e:React.ChangeEvent<HTMLInputElement>){
    const files=Array.from(e.target.files||[]);e.target.value='';let n=media.length;
    for(const f of files){if(n>=MAX_MEDIA){setNote(tr("Maximal ")+MAX_MEDIA+tr(" Medien."));break}
      const kind=f.type.startsWith('video/')?'video':'photo';
      try{if(kind==='video')await validateFallbackVideo(f);if(!mounted.current)return;onAdd(createPendingMedia(f,kind,f.name||kind+'-'+stamp()));n++;setNote('')}catch(er){if(!mounted.current)return;setNote(er instanceof Error?er.message:String(er))}}
  }
  const zs=caps.zoom;
  return <div className="cam" role="dialog" aria-modal="true" aria-label={title}>
    <div className="cam-stage" ref={stageEl}><video ref={videoEl} className={'cam-video'+(shown?' is-shown':'')} playsInline muted autoPlay onLoadedMetadata={markReady} onLoadedData={reveal} onPlaying={reveal} onResize={fit}/>
    {fallback&&<div className="cam-fallback"><p>{err}</p><button type="button" className="cam-pill blue" onClick={()=>fileEl.current?.click()}>{tr("Foto / Video aufnehmen")}</button></div>}
    {recording&&<div className="cam-rec" role="status"><i/>{String(Math.floor(secs/60)).padStart(2,'0')}{tr(":")}{String(secs%60).padStart(2,'0')}</div>}</div>
    <input ref={fileEl} className="cam-file" type="file" accept={mode==='video'?'video/*':'image/*,video/*'} capture="environment" multiple onChange={onFiles} aria-label={tr("Aufnahme über Kamera-App")}/>
    <div className="cam-top"><button type="button" className="cam-round" aria-label={tr("Zurück")} disabled={recording||finalizing} onClick={onBack}><ChevronLeft size={22}/></button><span className="cam-title">{title}</span>
      <button type="button" className="cam-round" aria-label={caps.torch?(torch?tr("Blitz aus"):tr("Blitz an")):tr("Blitz nicht verfügbar")} aria-pressed={torch} disabled={!caps.torch} onClick={toggleTorch}>{caps.torch&&torch?<Zap size={20}/>:<ZapOff size={20}/>}</button></div>
    <div className="cam-bottom">
      <div className={'cam-zoom'+(zs?'':' off')} aria-label={tr("Zoom")}><span>{zs?zoom.toFixed(1)+'x':'1.0x'}</span>
        <button type="button" aria-label={tr("Verkleinern")} disabled={!zs} onClick={()=>applyZoom(zoom-(zs?.step||.5))}><Minus size={16}/></button>
        <input type="range" aria-label={tr("Zoom")} disabled={!zs} min={zs?.min??1} max={zs?.max??1} step={zs?.step||.1} value={zs?zoom:1} onChange={e=>applyZoom(Number(e.target.value))}/>
        <button type="button" aria-label={tr("Vergrößern")} disabled={!zs} onClick={()=>applyZoom(zoom+(zs?.step||.5))}><Plus size={16}/></button>
        {!zs&&<small>{fallback?tr("Zoom in der Kamera-App"):tr("Zoom nicht verfügbar")}</small>}</div>
      {media.length>0&&<div className="cam-strip" aria-label={tr("Aufgenommene Medien")}>{media.map((m,i)=><div key={m.id} className="cam-thumb">{m.kind==='video'?<video src={urls.get(m.id)} muted playsInline/>:<img src={urls.get(m.id)} alt={tr("Aufnahme ")+(i+1)}/>}{m.kind==='video'&&<VideoIcon size={13}/>}<button type="button" aria-label={tr("Aufnahme ")+(i+1)+' entfernen'} onClick={()=>onRemove(m.id)}>{tr("×")}</button></div>)}</div>}
      <div className="cam-row">
        <div className="cam-modes" role="tablist"><button role="tab" aria-selected={mode==='photo'} className={mode==='photo'?'on':''} disabled={recording||finalizing} onClick={()=>chooseMode('photo')}>{tr("Photo")}</button><button role="tab" aria-selected={mode==='video'} className={mode==='video'?'on':''} disabled={recording||finalizing||(!canRecord&&!fallback)} onClick={()=>chooseMode('video')}>{tr("Video")}</button></div>
        {fallback?<button type="button" className="cam-shutter" aria-label={tr("Kamera-App öffnen")} onClick={()=>fileEl.current?.click()}><i/></button>
        :<button type="button" className={'cam-shutter'+(mode==='video'?' video':'')+(recording?' rec':'')} aria-label={mode==='photo'?tr("Foto aufnehmen"):recording?tr("Aufnahme stoppen"):tr("Aufnahme starten")} disabled={!ready||finalizing} onClick={mode==='photo'?take:toggleRecord}><i/></button>}
        <button type="button" className="cam-pill blue" disabled={recording||finalizing} onClick={onDone}>{tr("Done")}</button></div>
      <p className="cam-status" role="status">{note||(err&&!fallback?err:media.length?media.length+' / '+MAX_MEDIA+tr(" Medien aufgenommen")+(mode==='video'&&ready&&!hasAudio?tr(" · ohne Ton"):''):tr("No media captured yet"))}</p>
    </div></div>;
}
