import {t as tr} from './i18n';
import React,{useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,QrCode,Car,ChevronLeft,Camera,Zap,Minus,Plus} from 'lucide-react';
import {parseQrPayload,normalizePlate} from './booking-scan-parse';
import {createQrDecoder,validateImageFile,decodeQrFromFile,type QrDecoder} from './booking-scan-qr';
import {trapTab} from './undo-controls';
import {acquireCamera,releaseCamera,prewarmCamera,cancelPrewarm} from './camera-stream';
import {useEdgeBack} from './use-edge-back';
import '../main-scanner.css';
import {startCameraPreview} from './camera-preview';

export interface ScanLookup{kind:'qr'|'plate';value:string}
export interface MainScannerProps{
  /** QR with a valid booking code: parent performs the lookup (filter/focus/jump). Never navigates to a URL. */
  onLookup:(r:ScanLookup)=>void;
  /** Plate text read on this device: parent fills the MAIN search box. Nothing is opened automatically. */
  onPlate:(plate:string)=>void;
  onClose:()=>void;
  expectedHosts?:string[];
}
type View='menu'|'qr'|'plate';

/** Real capabilities of the live video track. Unsupported features stay null so the UI disables them honestly. */
export interface TrackCaps{torch:boolean;zoom:{min:number;max:number;step:number}|null}
export function readTrackCaps(t:MediaStreamTrack|undefined):TrackCaps{
  const g=(t as unknown as {getCapabilities?:()=>Record<string,unknown>}|undefined)?.getCapabilities;
  let c:Record<string,unknown>={};try{c=g?g.call(t)||{}:{}}catch{c={}}
  const z=c.zoom as {min?:number;max?:number;step?:number}|undefined;
  const ok=!!z&&typeof z.min==='number'&&typeof z.max==='number'&&z.max>z.min;
  return{torch:c.torch===true,zoom:ok?{min:z!.min!,max:z!.max!,step:z!.step&&z!.step>0?z!.step!:0.1}:null};
}

function useMounted(){const m=useRef(true);useEffect(()=>{m.current=true;return()=>{m.current=false}},[]);return m}

/** Starts the shared camera, reports capabilities, exposes torch/zoom. Always releases on unmount. */
function useScannerCamera(video:React.RefObject<HTMLVideoElement|null>,onLive?:()=>void){
  const preview=useRef<AbortController|null>(null);
  const gen=useRef(0),mounted=useMounted(),track=useRef<MediaStreamTrack|undefined>(undefined),held=useRef(false);
  const[state,setState]=useState<'starting'|'live'|'nocam'>('starting');const[err,setErr]=useState('');const[shown,setShown]=useState(false);
  const[caps,setCaps]=useState<TrackCaps>({torch:false,zoom:null});const[torchOn,setTorchOn]=useState(false);const[zoom,setZoomV]=useState(1);
  const stop=useCallback(()=>{setShown(false);gen.current++;preview.current?.abort();const v=video.current;if(v){try{v.pause()}catch{}v.srcObject=null}track.current=undefined;if(held.current){held.current=false;releaseCamera()}},[video]);
  useLayoutEffect(()=>{
    const my=++gen.current;
    (async()=>{
      if(!navigator.mediaDevices?.getUserMedia){setState('nocam');setErr(tr("Keine Kamera verfügbar. Foto oder manuelle Eingabe nutzen."));return}
      let s:MediaStream;
      try{s=await acquireCamera()}
      catch(e){if(my!==gen.current||!mounted.current)return;setState('nocam');setErr((e as DOMException)?.name==='NotAllowedError'?tr("Kamerazugriff wurde nicht erlaubt. Foto oder manuelle Eingabe nutzen."):tr("Keine Kamera verfügbar. Foto oder manuelle Eingabe nutzen."));return}
      if(my!==gen.current||!mounted.current){releaseCamera();return}
      held.current=true;const v=video.current;if(!v){held.current=false;releaseCamera();return}
      track.current=s.getVideoTracks()[0];setCaps(readTrackCaps(track.current));
      const controller=preview.current=new AbortController();
      try{
        await startCameraPreview(v,s,controller.signal);
        if(my!==gen.current||!mounted.current)return;
        setShown(true);setState('live');onLive?.();
      }catch{
        if(my!==gen.current||!mounted.current)return;
        stop();setState('nocam');setErr(tr("Vorschau konnte nicht gestartet werden."));
      }
    })();
    const vis=()=>{if(document.visibilityState==='hidden'){stop();setState('nocam');setErr(tr("Kamera pausiert. Zurück und erneut öffnen."))}};
    document.addEventListener('visibilitychange',vis);
    return()=>{document.removeEventListener('visibilitychange',vis);stop()};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const torch=async(on:boolean)=>{const t=track.current;if(!t||!caps.torch)return;try{await t.applyConstraints({advanced:[{torch:on} as MediaTrackConstraintSet]});if(mounted.current)setTorchOn(on)}catch{if(mounted.current){setTorchOn(false);setErr(tr("Blitz nicht verfügbar."))}}};
  const setZoom=async(z:number)=>{const t=track.current,c=caps.zoom;if(!t||!c)return;const v=Math.min(c.max,Math.max(c.min,z));try{await t.applyConstraints({advanced:[{zoom:v} as MediaTrackConstraintSet]});if(mounted.current)setZoomV(v)}catch{/* keep previous */}};
  return{state,err,setErr,shown,setShown,caps,torchOn,torch,zoom,setZoom,stop,gen,mounted};
}

function Portal({children}:{children:React.ReactNode}){return typeof document==='undefined'?<>{children}</>:createPortal(children,document.body)}

export function MainScanner(p:MainScannerProps){
  const[view,setView]=useState<View>('menu');
  const box=useRef<HTMLDivElement>(null),opener=useRef<HTMLElement|null>(null),scrim=useRef<HTMLDivElement>(null);
  useEffect(()=>{opener.current=document.activeElement as HTMLElement|null;return()=>{cancelPrewarm();const o=opener.current;setTimeout(()=>o?.focus(),0)}},[]);
  useEdgeBack(scrim,{enabled:true,blocked:true,priority:80,onBack:()=>{}});
  const keys=(e:React.KeyboardEvent)=>{
    if(e.key==='Escape'){e.stopPropagation();view==='menu'?p.onClose():setView('menu');return}
    if(e.key!=='Tab')return;
    const f=Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')||[]);
    if(!f.length)return;const i=f.indexOf(document.activeElement as HTMLElement);e.preventDefault();f[trapTab(i,f.length,e.shiftKey)].focus();
  };
  useEffect(()=>{box.current?.querySelector<HTMLElement>('[data-first]')?.focus()},[view]);
  if(view==='qr')return <QrScreen hosts={p.expectedHosts} onLookup={p.onLookup} onBack={()=>setView('menu')} onClose={p.onClose}/>;
  if(view==='plate')return <PlateScreen onPlate={p.onPlate} onBack={()=>setView('menu')}/>;
  return <div ref={scrim} className="ms-scrim" onClick={p.onClose}>
    <div ref={box} className="ms-sheet" role="dialog" aria-modal="true" aria-labelledby="ms-t" onKeyDown={keys} onClick={e=>e.stopPropagation()}>
      <div className="ms-handle" aria-hidden="true"/>
      <header className="ms-sheet-head"><h2 id="ms-t">{tr("Scannen")}</h2><button type="button" className="ms-sheet-x" aria-label={tr("Schließen")} onClick={p.onClose}><X size={16} strokeWidth={2.5}/></button></header>
      <div role="menu">
        <button type="button" role="menuitem" className="ms-item" data-first onClick={()=>{prewarmCamera();setView('qr')}}><QrCode size={22}/><span>{tr("QR code")}</span></button>
        <button type="button" role="menuitem" className="ms-item" onClick={()=>{cancelPrewarm();setView('plate')}}><Car size={22}/><span>{tr("License plate")}</span></button>
      </div>
    </div>
  </div>;
}

function TorchButton({caps,on,onToggle,className}:{caps:TrackCaps;on:boolean;onToggle:(v:boolean)=>void;className:string}){
  return <button type="button" className={className+(on?' on':'')} disabled={!caps.torch} aria-pressed={on} aria-label={caps.torch?tr("Blitz"):tr("Blitz nicht unterstützt")} title={caps.torch?undefined:tr("Blitz nicht unterstützt")} onClick={()=>onToggle(!on)}><Zap size={18} fill={on?'currentColor':'none'}/></button>;
}

function QrScreen({hosts,onLookup,onBack,onClose}:{hosts?:string[];onLookup:(r:ScanLookup)=>void;onBack:()=>void;onClose:()=>void}){
  const video=useRef<HTMLVideoElement>(null),dec=useRef<QrDecoder|null>(null),file=useRef<HTMLInputElement>(null),done=useRef(false),root=useRef<HTMLDivElement>(null);
  const[manual,setManual]=useState('');const[bad,setBad]=useState('');
  const photoJob=useRef(0);
  useLayoutEffect(()=>()=>{photoJob.current++},[]);
  const cam=useScannerCamera(video,()=>{loop()});
  const handle=useCallback((raw:string):boolean=>{
    if(done.current)return true;
    const r=parseQrPayload(raw,{expectedHosts:hosts});
    if(!r.ok){setBad(r.reason);return false}
    done.current=true;photoJob.current++;cam.stop();onLookup({kind:'qr',value:r.code});return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[hosts,onLookup]);
  const timer=useRef(0),raf=useRef(0),busy=useRef(false),last=useRef('');
  function loop(){
    const my=cam.gen.current;const v=video.current;
    const tick=async()=>{
      if(my!==cam.gen.current||!cam.mounted.current||done.current||!v)return;
      if(!busy.current&&v.videoWidth>0&&v.readyState>=2&&dec.current){
        busy.current=true;
        try{const raw=await dec.current.decode(v,v.videoWidth,v.videoHeight);if(my===cam.gen.current&&cam.mounted.current&&raw&&raw!==last.current){last.current=raw;if(handle(raw))return}}catch{/* next frame */}
        busy.current=false;
      }
      timer.current=window.setTimeout(()=>{raf.current=requestAnimationFrame(tick)},150);
    };
    raf.current=requestAnimationFrame(tick);
  }
  useEffect(()=>{let ok=true;createQrDecoder().then(d=>{if(ok)dec.current=d},()=>undefined);return()=>{ok=false;cancelAnimationFrame(raf.current);clearTimeout(timer.current)}},[]);
  useEdgeBack(root,{enabled:true,blocked:true,priority:80,onBack:()=>{}});
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose()}};document.addEventListener('keydown',k);return()=>document.removeEventListener('keydown',k)},[onClose]);
  const onFile=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0];e.target.value='';if(!f)return;
    const my=++photoJob.current;setBad('');
    const current=()=>my===photoJob.current&&cam.mounted.current&&!done.current;
    try{validateImageFile(f);const raw=await decodeQrFromFile(f,dec.current||undefined);if(!current())return;if(!raw)setBad(tr("Kein QR-Code im Foto erkannt."));else handle(raw)}
    catch(x){if(current())setBad(x instanceof Error?x.message:tr("Foto konnte nicht gelesen werden."))}
  };
  return <Portal><div ref={root} className="ms-full ms-qr" role="dialog" aria-modal="true" aria-labelledby="ms-qt" data-live={cam.state==='live'?'1':undefined}>
    <header className="ms-bar">
      <button type="button" className="ms-bar-btn" aria-label={tr("Schließen")} onClick={onClose}><X size={18} strokeWidth={2.5}/></button>
      <h2 id="ms-qt">{tr("Scan QR")}</h2><span className="ms-bar-spacer" aria-hidden="true"/>
    </header>
    <div className="ms-qr-body">
      <video ref={video} className={cam.shown?'is-shown':undefined} playsInline muted autoPlay aria-label={tr("Kamera")} onLoadedData={()=>cam.setShown(true)} onPlaying={()=>cam.setShown(true)}/>
      <TorchButton className="ms-torch ms-torch-left" caps={cam.caps} on={cam.torchOn} onToggle={cam.torch}/>
      {cam.state==='live'&&<div className="ms-reticle" aria-hidden="true"/>}
      {cam.state==='starting'&&<p className="ms-msg">{tr("Kamera wird gestartet…")}</p>}
      {(cam.err||bad)&&<p className="ms-err" role="alert">{bad||cam.err}</p>}
      {cam.state==='nocam'&&<div className="ms-fallback">
        <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={onFile}/>
        <button type="button" className="ms-btn" onClick={()=>file.current?.click()}><Camera size={16}/>  {tr("Foto aufnehmen")}</button>
        <form onSubmit={e=>{e.preventDefault();if(manual.trim())handle(manual)}}>
          <input aria-label={tr("Code manuell eingeben")} value={manual} onChange={e=>setManual(e.target.value.slice(0,2048))} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder={tr("z. B. AF-YA4TQSG")}/>
          <button type="submit" className="ms-btn primary" disabled={!manual.trim()}>{tr("Weiter")}</button>
        </form>
        <button type="button" className="ms-btn" onClick={onBack}>{tr("Zurück")}</button>
      </div>}
    </div>
  </div></Portal>;
}

/** Crop the plate frame area out of the video, scale for OCR, grayscale. Pure geometry is exported for tests. */
export function frameToVideoRect(view:{w:number;h:number},frame:{x:number;y:number;w:number;h:number},vid:{w:number;h:number},pad=0.12){
  const s=Math.max(view.w/vid.w,view.h/vid.h),ox=(vid.w*s-view.w)/2,oy=(vid.h*s-view.h)/2;
  let x=(frame.x+ox)/s,y=(frame.y+oy)/s,w=frame.w/s,h=frame.h/s;
  const px=w*pad,py=h*pad;x-=px;y-=py;w+=2*px;h+=2*py;
  x=Math.max(0,x);y=Math.max(0,y);w=Math.min(vid.w-x,w);h=Math.min(vid.h-y,h);
  return{x,y,w,h};
}

function PlateScreen({onPlate,onBack}:{onPlate:(p:string)=>void;onBack:()=>void}){
  const video=useRef<HTMLVideoElement>(null),viewRef=useRef<HTMLDivElement>(null),frameRef=useRef<HTMLDivElement>(null),root=useRef<HTMLDivElement>(null),file=useRef<HTMLInputElement>(null);
  const ocr=useRef<import('./booking-scan-ocr').PlateOcr|null>(null),ctl=useRef<AbortController|null>(null),job=useRef(0);
  const[busy,setBusy]=useState(false);const[msg,setMsg]=useState('');const[manual,setManual]=useState('');
  const cam=useScannerCamera(video);
  useEffect(()=>()=>{ctl.current?.abort();void ocr.current?.dispose();ocr.current=null},[]);
  useEdgeBack(root,{enabled:true,blocked:true,priority:80,onBack:()=>{}});
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onBack()}};document.addEventListener('keydown',k);return()=>document.removeEventListener('keydown',k)},[onBack]);
  const run=async(blobP:()=>Promise<Blob>)=>{
    ctl.current?.abort();const c=ctl.current=new AbortController();const my=++job.current;setMsg('');setBusy(true);
    try{
      const m=await import('./booking-scan-ocr');
      if(!cam.mounted.current||my!==job.current)return;
      ocr.current=ocr.current||m.createPlateOcr();
      const img=await blobP();
      const r=await ocr.current.recognize(img,c.signal);
      if(!cam.mounted.current||my!==job.current)return;
      const best=r.candidates[0];
      if(!best){setMsg(tr("Kein Kennzeichen erkannt. Foto näher aufnehmen oder manuell eingeben."));return}
      cam.stop();onPlate(best.display);
    }catch(x){if(cam.mounted.current&&my===job.current&&!c.signal.aborted)setMsg(tr("Texterkennung fehlgeschlagen: ")+(x instanceof Error?x.message:'')+'. '+tr("Bitte manuell eingeben."))}
    finally{if(cam.mounted.current&&my===job.current)setBusy(false)}
  };
  const shoot=()=>{
    const v=video.current,vw=v?.videoWidth||0,vh=v?.videoHeight||0,vr=viewRef.current?.getBoundingClientRect(),fr=frameRef.current?.getBoundingClientRect();
    if(!v||!vw||!vh||!vr||!fr||busy)return;
    const rect=frameToVideoRect({w:vr.width,h:vr.height},{x:fr.left-vr.left,y:fr.top-vr.top,w:fr.width,h:fr.height},{w:vw,h:vh});
    void run(async()=>{
      const k=Math.min(3,Math.max(1,260/Math.max(1,rect.h)));
      const c=document.createElement('canvas');c.width=Math.max(1,Math.round(rect.w*k));c.height=Math.max(1,Math.round(rect.h*k));
      const g=c.getContext('2d');if(!g)throw new Error(tr("Bildverarbeitung nicht verfügbar."));
      g.filter='grayscale(1) contrast(1.35)';g.drawImage(v,rect.x,rect.y,rect.w,rect.h,0,0,c.width,c.height);
      return await new Promise<Blob>((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error(tr("Bild konnte nicht verarbeitet werden."))),'image/png'));
    });
  };
  const onFile=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0];e.target.value='';if(!f)return;
    try{validateImageFile(f)}catch(x){setMsg(x instanceof Error?x.message:tr("Ungültiges Foto."));return}
    void run(async()=>(await import('./booking-scan-ocr')).preparePlatePhoto(f));
  };
  const z=cam.caps.zoom;const zv=z?cam.zoom:1;
  const step=z?Math.max(z.step,(z.max-z.min)/10):0.5;
  return <Portal><div ref={root} className="ms-full ms-plate" role="dialog" aria-modal="true" aria-labelledby="ms-pt">
    <header className="ms-bar">
      <button type="button" className="ms-bar-btn" aria-label={tr("Zurück")} onClick={onBack}><ChevronLeft size={20} strokeWidth={2.5} className="ms-flip"/></button>
      <h2 id="ms-pt">{tr("Kennzeichen scannen (beta)")}</h2>
    </header>
    <div ref={viewRef} className="ms-plate-view">
      <video ref={video} className={cam.shown?'is-shown':undefined} playsInline muted autoPlay aria-label={tr("Kamera")} onLoadedData={()=>cam.setShown(true)} onPlaying={()=>cam.setShown(true)}/>
      <TorchButton className="ms-torch ms-torch-right" caps={cam.caps} on={cam.torchOn} onToggle={cam.torch}/>
      <div ref={frameRef} className="ms-plate-frame" aria-hidden="true"/>
      {cam.state==='starting'&&<p className="ms-msg">{tr("Kamera wird gestartet…")}</p>}
    </div>
    <p className="ms-hint">{tr("Kennzeichen im Rahmen ausrichten")}</p>
    {(msg||cam.err)&&<p className="ms-err in-flow" role="alert">{msg||cam.err}</p>}
    {busy&&<p className="ms-hint" role="status">{tr("Kennzeichen wird auf dem Gerät gelesen…")}</p>}
    <div className="ms-zoom" aria-label={tr("Zoom")} title={z?undefined:tr("Zoom nicht unterstützt")}>
      <span className="ms-zoom-val" aria-live="off">{zv.toFixed(1)}{"x"}</span>
      <button type="button" className="ms-zoom-btn" aria-label={tr("Verkleinern")} disabled={!z||zv<=z.min} onClick={()=>cam.setZoom(zv-step)}><Minus size={14}/></button>
      <input type="range" aria-label={tr("Zoom")} disabled={!z} min={z?.min??1} max={z?.max??1} step={z?.step??0.1} value={zv} onChange={e=>cam.setZoom(Number(e.target.value))}/>
      <button type="button" className="ms-zoom-btn" aria-label={tr("Vergrößern")} disabled={!z||zv>=z.max} onClick={()=>cam.setZoom(zv+step)}><Plus size={14}/></button>
      <button type="button" className="ms-zoom-reset" disabled={!z} onClick={()=>cam.setZoom(1)}>{"1x"}</button>
    </div>
    <div className="ms-shutter-row">
      <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={onFile}/>
      {cam.state==='nocam'
        ?<form className="ms-manual" onSubmit={e=>{e.preventDefault();if(normalizePlate(manual).length>=2)onPlate(manual.trim())}}>
          <button type="button" className="ms-btn" onClick={()=>file.current?.click()} disabled={busy}><Camera size={16}/>  {tr("Kennzeichen fotografieren")}</button>
          <input aria-label={tr("Kennzeichen manuell")} value={manual} onChange={e=>setManual(e.target.value.slice(0,16))} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder={tr("z. B. D AB 1234")}/>
          <button type="submit" className="ms-btn primary" disabled={normalizePlate(manual).length<2}>{tr("Weiter")}</button>
        </form>
        :busy?<button type="button" className="ms-shutter busy" aria-label={tr("Abbrechen")} onClick={()=>{ctl.current?.abort();job.current++;setBusy(false);void ocr.current?.dispose();ocr.current=null}}><span/></button>
        :<button type="button" className="ms-shutter" aria-label={tr("Kennzeichen scannen")} disabled={cam.state!=='live'} onClick={shoot}><span/></button>}
    </div>
  </div></Portal>;
}
