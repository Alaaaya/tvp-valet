import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ChevronLeft,Zap,ZapOff,Minus,Plus,Video as VideoIcon} from 'lucide-react';
import {createPendingMedia,type PendingMedia} from './handover-api';

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
  const videoEl=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),rec=useRef<MediaRecorder|null>(null),chunks=useRef<Blob[]>([]),bytes=useRef(0),timer=useRef<number|undefined>(undefined),discard=useRef(false),fileEl=useRef<HTMLInputElement>(null),mounted=useRef(true),gen=useRef(0);
  const[mode,setMode]=useState<'photo'|'video'>('photo'),[ready,setReady]=useState(false),[fallback,setFallback]=useState(false),[err,setErr]=useState(''),[caps,setCaps]=useState<Caps>({}),[zoom,setZoom]=useState(1),[torch,setTorch]=useState(false),[recording,setRecording]=useState(false),[secs,setSecs]=useState(0),[note,setNote]=useState(''),[hasAudio,setHasAudio]=useState(false);
  const urls=useObjectUrls(media);const markReady=()=>{const v=videoEl.current;if(stream.current&&v&&v.videoWidth>0)setReady(true)};
  const full=media.length>=MAX_MEDIA;
  const canRecord=typeof MediaRecorder!=='undefined'&&pickVideoMime(MediaRecorder)!==null&&pickVideoMime(MediaRecorder)!=='';

  const stopStream=useCallback(()=>{stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;if(videoEl.current)videoEl.current.srcObject=null;setReady(false)},[]);
  const stopRecorder=useCallback((drop:boolean)=>{window.clearInterval(timer.current);const r=rec.current;if(r&&r.state!=='inactive'){discard.current=drop;try{r.stop()}catch{}}else if(drop){chunks.current=[]}setRecording(false)},[]);

  const start=useCallback(async(wantAudio:boolean)=>{
    const my=++gen.current;
    if(!navigator.mediaDevices?.getUserMedia){setFallback(true);setErr('Live-Kamera wird von diesem Browser nicht unterstützt. Aufnahme über die Kamera-App.');return}
    stopStream();
    let s:MediaStream|null=null,audio=false;
    const base:MediaTrackConstraints={facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}};
    try{
      if(wantAudio){try{s=await navigator.mediaDevices.getUserMedia({video:base,audio:true});audio=true}catch{/* no microphone: record video without sound */}}
      if(!s)s=await navigator.mediaDevices.getUserMedia({video:base,audio:false});
    }catch(e){if(my!==gen.current)return;setFallback(true);const n=(e as DOMException)?.name;setErr(n==='NotAllowedError'||n==='SecurityError'?'Kamerazugriff verweigert. Aufnahme stattdessen über die Kamera-App.':'Kamera nicht verfügbar. Aufnahme stattdessen über die Kamera-App.');return}
    if(my!==gen.current||!mounted.current){s.getTracks().forEach(t=>t.stop());return}
    stream.current=s;setHasAudio(audio);setFallback(false);setErr('');
    const track=s.getVideoTracks()[0];let c:Caps={};
    try{const raw=(track.getCapabilities?.()||{}) as any;if(raw.zoom&&raw.zoom.max>raw.zoom.min)c.zoom={min:raw.zoom.min,max:raw.zoom.max,step:raw.zoom.step};if(raw.torch)c.torch=true}catch{}
    setCaps(c);setZoom(c.zoom?Math.max(c.zoom.min,1):1);setTorch(false);
    const v=videoEl.current;if(v){v.srcObject=s;v.muted=true;try{await v.play()}catch{if(my===gen.current)setNote('Vorschau konnte nicht gestartet werden.')}}
    if(my===gen.current&&v&&v.videoWidth>0&&v.readyState>=2)setReady(true);
  },[stopStream]);

  useEffect(()=>{mounted.current=true;start(false);
    const vis=()=>{if(document.visibilityState==='hidden'){stopRecorder(false);stopStream()}else if(!stream.current&&!fallbackRef.current)start(false)};
    document.addEventListener('visibilitychange',vis);
    return()=>{mounted.current=false;gen.current++;document.removeEventListener('visibilitychange',vis);stopRecorder(true);stopStream()}},[]);
  const fallbackRef=useRef(false);fallbackRef.current=fallback;

  async function applyZoom(z:number){if(!caps.zoom||!stream.current)return;const v=Math.min(caps.zoom.max,Math.max(caps.zoom.min,z));setZoom(v);try{await stream.current.getVideoTracks()[0].applyConstraints({advanced:[{zoom:v} as any]})}catch{setNote('Zoom wird vom Gerät nicht angenommen.')}}
  async function toggleTorch(){if(!caps.torch||!stream.current)return;const n=!torch;try{await stream.current.getVideoTracks()[0].applyConstraints({advanced:[{torch:n} as any]});setTorch(n)}catch{setNote('Blitz wird vom Gerät nicht angenommen.')}}

  function take(){
    if(full){setNote('Maximal '+MAX_MEDIA+' Medien.');return}
    const v=videoEl.current;if(!v||!ready||!v.videoWidth)return;
    const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d')!.drawImage(v,0,0);
    c.toBlob(b=>{if(!mounted.current)return;if(!b){setNote('Foto konnte nicht erstellt werden.');return}
      if(b.size>10*1024*1024){setNote('Foto ist größer als 10 MB.');return}
      try{onAdd(createPendingMedia(b,'photo','photo-'+stamp()+'.jpg'));setNote('')}catch(e){setNote(e instanceof Error?e.message:String(e))}},'image/jpeg',.9);
  }

  async function toggleRecord(){
    if(recording){stopRecorder(false);return}
    if(full){setNote('Maximal '+MAX_MEDIA+' Medien.');return}
    if(!canRecord){setNote('Videoaufnahme wird in diesem Browser nicht unterstützt.');return}
    if(!stream.current)return;
    const mime=pickVideoMime(MediaRecorder)!;chunks.current=[];bytes.current=0;discard.current=false;
    let r:MediaRecorder;try{r=new MediaRecorder(stream.current,{mimeType:mime})}catch{try{r=new MediaRecorder(stream.current)}catch{setNote('Videoaufnahme konnte nicht gestartet werden.');return}}
    rec.current=r;
    r.onerror=ev=>{window.clearInterval(timer.current);setRecording(false);discard.current=true;try{if(r.state!=='inactive')r.stop()}catch{}chunks.current=[];if(mounted.current)setNote('Videoaufnahme fehlgeschlagen'+((ev as any)?.error?.message?': '+(ev as any).error.message:'')+'.')};
    r.ondataavailable=e=>{if(e.data&&e.data.size){chunks.current.push(e.data);bytes.current+=e.data.size;if(bytes.current>=MAX_VIDEO_BYTES&&r.state==='recording'){setNote('Video auf 45 MB begrenzt.');r.stop()}}};
    r.onstop=()=>{window.clearInterval(timer.current);setRecording(false);const drop=discard.current;const type=(r.mimeType||mime||'video/webm').split(';')[0];const parts=chunks.current;chunks.current=[];if(drop||!parts.length)return;
      const blob=new Blob(parts,{type});if(!mounted.current)return;try{validateVideoSize(blob.size);onAdd(createPendingMedia(blob,'video','video-'+stamp()+'.'+(type.includes('mp4')?'mp4':'webm')))}catch(e){setNote(e instanceof Error?e.message:String(e))}};
    try{r.start(1000)}catch(e){rec.current=null;setNote('Videoaufnahme konnte nicht gestartet werden'+(e instanceof Error&&e.message?': '+e.message:'')+'.');return}
    setRecording(true);setSecs(0);const t0=Date.now();
    timer.current=window.setInterval(()=>{const s=Math.floor((Date.now()-t0)/1000);setSecs(s);if(s>=MAX_VIDEO_SECONDS&&r.state==='recording'){setNote('Video auf 120 Sekunden begrenzt.');r.stop()}},500);
  }

  async function chooseMode(m:'photo'|'video'){
    if(recording||m===mode)return;setMode(m);setNote('');
    if(fallback)return;
    if(m==='video'&&!canRecord){setNote('Videoaufnahme wird in diesem Browser nicht unterstützt.');return}
    await start(m==='video');
  }

  async function onFiles(e:React.ChangeEvent<HTMLInputElement>){
    const files=Array.from(e.target.files||[]);e.target.value='';let n=media.length;
    for(const f of files){if(n>=MAX_MEDIA){setNote('Maximal '+MAX_MEDIA+' Medien.');break}
      const kind=f.type.startsWith('video/')?'video':'photo';
      try{if(kind==='video')await validateFallbackVideo(f);if(!mounted.current)return;onAdd(createPendingMedia(f,kind,f.name||kind+'-'+stamp()));n++;setNote('')}catch(er){if(!mounted.current)return;setNote(er instanceof Error?er.message:String(er))}}
  }
  const zs=caps.zoom;
  return <div className="cam" role="dialog" aria-modal="true" aria-label={title}>
    <video ref={videoEl} className="cam-video" playsInline muted autoPlay onLoadedMetadata={markReady} onPlaying={markReady}/>
    {fallback&&<div className="cam-fallback"><p>{err}</p><button type="button" className="cam-pill blue" onClick={()=>fileEl.current?.click()}>Foto / Video aufnehmen</button></div>}
    <input ref={fileEl} className="cam-file" type="file" accept={mode==='video'?'video/*':'image/*,video/*'} capture="environment" multiple onChange={onFiles} aria-label="Aufnahme über Kamera-App"/>
    <div className="cam-top"><button type="button" className="cam-round" aria-label="Zurück" onClick={onBack}><ChevronLeft size={22}/></button><span className="cam-title">{title}</span>
      <button type="button" className="cam-round" aria-label={caps.torch?(torch?'Blitz aus':'Blitz an'):'Blitz nicht verfügbar'} aria-pressed={torch} disabled={!caps.torch} onClick={toggleTorch}>{caps.torch&&torch?<Zap size={20}/>:<ZapOff size={20}/>}</button></div>
    {recording&&<div className="cam-rec" role="status"><i/>{String(Math.floor(secs/60)).padStart(2,'0')}:{String(secs%60).padStart(2,'0')}</div>}
    <div className="cam-bottom">
      <div className={'cam-zoom'+(zs?'':' off')} aria-label="Zoom"><span>{zs?zoom.toFixed(1)+'x':'1.0x'}</span>
        <button type="button" aria-label="Verkleinern" disabled={!zs} onClick={()=>applyZoom(zoom-(zs?.step||.5))}><Minus size={16}/></button>
        <input type="range" aria-label="Zoom" disabled={!zs} min={zs?.min??1} max={zs?.max??1} step={zs?.step||.1} value={zs?zoom:1} onChange={e=>applyZoom(Number(e.target.value))}/>
        <button type="button" aria-label="Vergrößern" disabled={!zs} onClick={()=>applyZoom(zoom+(zs?.step||.5))}><Plus size={16}/></button>
        {!zs&&<small>{fallback?'Zoom in der Kamera-App':'Zoom nicht verfügbar'}</small>}</div>
      {media.length>0&&<div className="cam-strip" aria-label="Aufgenommene Medien">{media.map((m,i)=><div key={m.id} className="cam-thumb">{m.kind==='video'?<video src={urls.get(m.id)} muted playsInline/>:<img src={urls.get(m.id)} alt={'Aufnahme '+(i+1)}/>}{m.kind==='video'&&<VideoIcon size={13}/>}<button type="button" aria-label={'Aufnahme '+(i+1)+' entfernen'} onClick={()=>onRemove(m.id)}>×</button></div>)}</div>}
      <div className="cam-row">
        <div className="cam-modes" role="tablist"><button role="tab" aria-selected={mode==='photo'} className={mode==='photo'?'on':''} disabled={recording} onClick={()=>chooseMode('photo')}>Photo</button><button role="tab" aria-selected={mode==='video'} className={mode==='video'?'on':''} disabled={recording||(!canRecord&&!fallback)} onClick={()=>chooseMode('video')}>Video</button></div>
        {fallback?<button type="button" className="cam-shutter" aria-label="Kamera-App öffnen" onClick={()=>fileEl.current?.click()}><i/></button>
        :<button type="button" className={'cam-shutter'+(mode==='video'?' video':'')+(recording?' rec':'')} aria-label={mode==='photo'?'Foto aufnehmen':recording?'Aufnahme stoppen':'Aufnahme starten'} disabled={!ready} onClick={mode==='photo'?take:toggleRecord}><i/></button>}
        <button type="button" className="cam-pill blue" disabled={recording} onClick={onDone}>Done</button></div>
      <p className="cam-status" role="status">{note||(err&&!fallback?err:media.length?media.length+' / '+MAX_MEDIA+' Medien aufgenommen'+(mode==='video'&&ready&&!hasAudio?' · ohne Ton':''):'No media captured yet')}</p>
    </div></div>;
}
