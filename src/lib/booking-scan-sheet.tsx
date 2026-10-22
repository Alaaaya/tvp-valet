import {t as tr} from './i18n';
import React,{useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {X,QrCode,Car,ChevronLeft,Camera,Search} from 'lucide-react';
import {parseQrPayload,isValidBookingCode,normalizePlate,type PlateCandidate} from './booking-scan-parse';
import {createQrDecoder,decodeQrFromFile,validateImageFile,type QrDecoder} from './booking-scan-qr';
import {trapTab} from './undo-controls';
import {acquireCamera,releaseCamera,prewarmCamera,cancelPrewarm} from './camera-stream';
import {useEdgeBack} from './use-edge-back';
import '../booking-scan.css';

export interface ScanLookup{kind:'qr'|'plate';value:string}
export interface BookingScanSheetProps{
  /** Parent performs the lookup (filter/focus/jump). The sheet never selects a booking itself. */
  onLookup:(r:ScanLookup)=>void;
  onClose:()=>void;
  /** optional hosts accepted for QR links; default accepts any host but only extracts a code */
  expectedHosts?:string[];
}
type View='menu'|'qr'|'plate';
type Found={kind:'qr'|'plate';value:string;note?:string;confidence?:number;alts?:{display:string;key:string}[]};

export function BookingScanSheet(p:BookingScanSheetProps){
  const[view,setView]=useState<View>('menu');const[found,setFound]=useState<Found|null>(null);
  const box=useRef<HTMLDivElement>(null),opener=useRef<HTMLElement|null>(null);
  useEffect(()=>{opener.current=document.activeElement as HTMLElement|null;return()=>{cancelPrewarm();const o=opener.current;setTimeout(()=>o?.focus(),0)}},[]);
  // Plate scanning uses the photo picker, not the live stream: drop a prewarmed stream right away.
  useEffect(()=>{if(view==='plate')cancelPrewarm()},[view]);
  useEffect(()=>{box.current?.querySelector<HTMLElement>('[data-first],button:not(:disabled),input')?.focus()},[view,found]);
  const scrim=useRef<HTMLDivElement>(null);
  useEdgeBack(scrim,{enabled:true,blocked:true,priority:80,onBack:()=>{}});
  const back=()=>{if(found){setFound(null);return}view==='menu'?p.onClose():setView('menu')};
  const keys=(e:React.KeyboardEvent)=>{
    if(e.key==='Escape'){e.stopPropagation();back();return}
    if(e.key!=='Tab')return;
    const f=Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')||[]);
    if(!f.length)return;const i=f.indexOf(document.activeElement as HTMLElement);e.preventDefault();f[trapTab(i,f.length,e.shiftKey)].focus();
  };
  const title=found?tr("Bestätigen"):view==='menu'?tr("Scan"):view==='qr'?tr("QR code"):tr("License plate");
  return <div ref={scrim} className="bsc-scrim" onClick={p.onClose}>
    <div ref={box} className="bsc" role="dialog" aria-modal="true" aria-labelledby="bsc-t" onKeyDown={keys} onClick={e=>e.stopPropagation()}>
      <div className="bsc-handle" aria-hidden="true"/>
      <header className="bsc-head">
        {view!=='menu'&&<button type="button" className="bsc-x" aria-label={tr("Zurück")} onClick={back}><ChevronLeft size={20}/></button>}
        <h2 id="bsc-t">{title}</h2>
        <button type="button" className="bsc-x" aria-label={tr("Schließen")} onClick={p.onClose}><X size={20}/></button>
      </header>
      {found?<Confirm key={found.kind+found.value} f={found} onLookup={p.onLookup} onRetry={()=>setFound(null)}/>
        :view==='menu'?<div role="menu">
          <button type="button" role="menuitem" className="bsc-item" data-first onClick={()=>{prewarmCamera();setView('qr')}}><QrCode size={22}/><span>{tr("QR code")}</span></button>
          <button type="button" role="menuitem" className="bsc-item" onClick={()=>setView('plate')}><Car size={22}/><span>{tr("License plate")}</span></button>
        </div>
        :view==='qr'?<QrPane hosts={p.expectedHosts} onFound={setFound}/>
        :<PlatePane onFound={setFound}/>}
    </div>
  </div>;
}

function Confirm({f,onLookup,onRetry}:{f:Found;onLookup:(r:ScanLookup)=>void;onRetry:()=>void}){
  const[v,setV]=useState(f.value);const ok=f.kind==='qr'?isValidBookingCode(v.trim()):normalizePlate(v).length>=2;
  const go=()=>{if(!ok)return;onLookup({kind:f.kind,value:f.kind==='qr'?v.trim().replace(/^#/,'').toUpperCase():v.trim()})};
  return <form className="bsc-body" onSubmit={e=>{e.preventDefault();go()}}>
    <label className="bsc-lab">{f.kind==='qr'?tr("Buchungscode"):tr("Kennzeichen")}
      <input data-first value={v} onChange={e=>setV(f.kind==='qr'?e.target.value.slice(0,40):e.target.value.slice(0,16))} autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text" maxLength={f.kind==='qr'?40:16}/>
    </label>
    {f.kind==='qr'&&!ok&&<p className="bsc-err" role="alert">{tr("Ungültiger Buchungscode. Erlaubt sind Buchstaben, Ziffern und Bindestriche (3-40 Zeichen).")}</p>}
    {f.note&&<p className="bsc-hint">{f.note}</p>}
    {f.confidence!==undefined&&<p className={'bsc-hint'+(f.confidence<60?' warn':'')}>{tr("Erkennungssicherheit")}{f.confidence}{"%"}{f.confidence<60?tr(" - bitte genau prüfen"):''}</p>}
    {f.alts&&f.alts.length>0&&<div className="bsc-alts">{f.alts.map(a=><button type="button" key={a.key} className="bsc-chip" onClick={()=>setV(a.display)}>{a.display}</button>)}</div>}
    <div className="bsc-row"><button type="button" className="bsc-btn" onClick={onRetry}>{tr("Erneut scannen")}</button><button type="submit" className="bsc-btn primary" disabled={!ok}><Search size={16}/>  {tr("Suchen")}</button></div>
  </form>;
}

function useMounted(){const m=useRef(true);useEffect(()=>{m.current=true;return()=>{m.current=false}},[]);return m}

function QrPane({hosts,onFound}:{hosts?:string[];onFound:(f:Found)=>void}){
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),gen=useRef(0),mounted=useMounted(),file=useRef<HTMLInputElement>(null),dec=useRef<QrDecoder|null>(null),fileJob=useRef(0);
  const[state,setState]=useState<'starting'|'live'|'nocam'>('starting');const[shown,setShown]=useState(false);const[err,setErr]=useState('');const[manual,setManual]=useState('');
  const stop=useCallback(()=>{setShown(false);gen.current++;fileJob.current++;if(video.current){try{video.current.pause()}catch{}video.current.srcObject=null}if(stream.current){stream.current=null;releaseCamera()}},[]);
  const handle=useCallback((raw:string):boolean=>{
    const r=parseQrPayload(raw,{expectedHosts:hosts});
    if(!r.ok){setErr(r.reason);return false}
    stop();onFound({kind:'qr',value:r.code,note:r.alternatives?.length?tr("Mehrere Codes im QR-Link gefunden. Bitte den richtigen auswählen. Es wird kein Link geöffnet."):r.source==='plain'?undefined:tr("Code aus QR-Link gelesen. Es wird kein Link geöffnet."),alts:r.alternatives?.map(c=>({display:c,key:c}))});return true;
  },[hosts,onFound,stop]);
  // Layout effect: join/start getUserMedia before the first paint. The QR decoder is created in
  // parallel and never delays the preview.
  useLayoutEffect(()=>{
    const my=++gen.current;let raf=0,timer=0,last='';
    const decP=createQrDecoder().then(d=>{if(my===gen.current)dec.current=d;return d},()=>null);
    (async()=>{
      if(!navigator.mediaDevices?.getUserMedia){setState('nocam');return}
      let s:MediaStream;
      try{s=await acquireCamera()}
      catch(e){if(my!==gen.current||!mounted.current)return;setState('nocam');setErr((e as DOMException)?.name==='NotAllowedError'?tr("Kamerazugriff wurde nicht erlaubt. Foto oder manuelle Eingabe nutzen."):tr("Keine Kamera verfügbar. Foto oder manuelle Eingabe nutzen."));return}
      if(my!==gen.current||!mounted.current){releaseCamera();return}
      stream.current=s;const v=video.current;if(!v){stream.current=null;releaseCamera();return}
      v.srcObject=s;v.setAttribute('playsinline','true');v.muted=true;{const rv=(v as any).requestVideoFrameCallback;if(typeof rv==='function'){try{rv.call(v,()=>{if(my===gen.current&&mounted.current)setShown(true)})}catch{/* events still reveal */}}}
      const playing=(()=>{try{return v.play()}catch{return undefined}})();
      setState('live');
      try{await playing}catch{/* autoplay quirks; frames still decode once playing */}
      if(my!==gen.current||!mounted.current)return;
      let busy=false;
      const tick=async()=>{
        if(my!==gen.current||!mounted.current)return;
        if(!busy&&v.videoWidth>0&&v.readyState>=2&&dec.current){
          busy=true;
          try{const raw=await dec.current.decode(v,v.videoWidth,v.videoHeight);
            if(my===gen.current&&mounted.current&&raw&&raw!==last){last=raw;if(handle(raw))return}}catch{/* next frame */}
          busy=false;
        }
        timer=window.setTimeout(()=>{raf=requestAnimationFrame(tick)},150);
      };
      raf=requestAnimationFrame(tick);
    })();
    const vis=()=>{if(document.visibilityState==='hidden'){stop();setState('nocam');setErr(tr("Kamera pausiert. Zurück und erneut öffnen."))}};
    document.addEventListener('visibilitychange',vis);
    return()=>{document.removeEventListener('visibilitychange',vis);cancelAnimationFrame(raf);clearTimeout(timer);stop()};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const onFile=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0];e.target.value='';if(!f)return;const job=++fileJob.current;setErr('');
    try{const raw=await decodeQrFromFile(f,dec.current||undefined);if(!mounted.current||job!==fileJob.current)return;if(!raw)setErr(tr("Kein QR-Code im Foto erkannt."));else handle(raw)}
    catch(x){if(mounted.current&&job===fileJob.current)setErr(x instanceof Error?x.message:tr("Foto konnte nicht gelesen werden."))}
  };
  return <div className="bsc-body">
    <div className={'bsc-view'+(state==='live'?' live':'')}>
      <video ref={video} className={shown?'is-shown':undefined} playsInline muted autoPlay aria-label={tr("Kamera")} onLoadedData={()=>{if(stream.current)setShown(true)}} onPlaying={()=>{if(stream.current)setShown(true)}}/>
      {state==='live'&&<div className="bsc-frame" aria-hidden="true"/>}
      {state==='starting'&&<p className="bsc-view-msg">{tr("Kamera wird gestartet…")}</p>}
      {state==='nocam'&&<p className="bsc-view-msg">{tr("Keine Live-Kamera")}</p>}
    </div>
    {err&&<p className="bsc-err" role="alert">{err}</p>}
    <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={onFile}/>
    <button type="button" className="bsc-btn" onClick={()=>file.current?.click()}><Camera size={16}/>  {tr("Foto aufnehmen")}</button>
    <form className="bsc-manual" onSubmit={e=>{e.preventDefault();if(manual.trim())handle(manual)}}>
      <label className="bsc-lab">{tr("Code manuell eingeben")}<input value={manual} onChange={e=>setManual(e.target.value.slice(0,2048))} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder={tr("z. B. AF-YA4TQSG")}/></label>
      <button type="submit" className="bsc-btn primary" disabled={!manual.trim()}>{tr("Weiter")}</button>
    </form>
  </div>;
}

function PlatePane({onFound}:{onFound:(f:Found)=>void}){
  const file=useRef<HTMLInputElement>(null),mounted=useMounted(),ocr=useRef<import('./booking-scan-ocr').PlateOcr|null>(null),ctl=useRef<AbortController|null>(null),job=useRef(0);
  const[busy,setBusy]=useState(false);const[err,setErr]=useState('');const[manual,setManual]=useState('');const[preview,setPreview]=useState('');
  useEffect(()=>()=>{ctl.current?.abort();void ocr.current?.dispose();ocr.current=null},[]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
  const onFile=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const f=e.target.files?.[0];e.target.value='';if(!f)return;
    if(f.size>15*1024*1024||!f.type.startsWith('image/')){setErr(tr("Bitte ein Foto bis 15 MB auswählen."));return}
    ctl.current?.abort();const c=ctl.current=new AbortController();const my=++job.current;setErr('');
    try{validateImageFile(f)}catch(x){setPreview('');setErr(x instanceof Error?x.message:tr("Ungültiges Foto."));return}
    setBusy(true);setPreview(URL.createObjectURL(f));
    try{
      const m=await import('./booking-scan-ocr');
      if(!mounted.current||my!==job.current)return;
      ocr.current=ocr.current||m.createPlateOcr();
      const img=await m.preparePlatePhoto(f);
      const r=await ocr.current.recognize(img,c.signal);
      if(!mounted.current||my!==job.current)return;
      const best=r.candidates[0];
      if(!best){setErr(tr("Kein Kennzeichen erkannt. Foto näher aufnehmen oder manuell eingeben."));return}
      onFound({kind:'plate',value:best.display,confidence:r.confidence,alts:r.candidates.slice(1,4),note:tr("Bitte mit dem Fahrzeug vergleichen. Das Foto bleibt auf diesem Gerät.")});
    }catch(x){if(mounted.current&&my===job.current&&!c.signal.aborted)setErr(x instanceof Error&&x.message!=='abgebrochen'?tr("Texterkennung fehlgeschlagen: ")+x.message+'. Bitte manuell eingeben.':tr("Texterkennung abgebrochen."))}
    finally{if(mounted.current&&my===job.current)setBusy(false)}
  };
  const cancel=()=>{ctl.current?.abort();job.current++;setBusy(false);void ocr.current?.dispose();ocr.current=null};
  return <div className="bsc-body">
    {preview&&<img className="bsc-preview" src={preview} alt={tr("Foto des Kennzeichens")}/>}
    {err&&<p className="bsc-err" role="alert">{err}</p>}
    {busy&&<p className="bsc-hint" role="status">{tr("Kennzeichen wird auf dem Gerät gelesen…")}</p>}
    <input ref={file} type="file" accept="image/*" capture="environment" hidden onChange={onFile}/>
    {busy?<button type="button" className="bsc-btn" onClick={cancel}>{tr("Abbrechen")}</button>
      :<button type="button" className="bsc-btn primary" data-first onClick={()=>file.current?.click()}><Camera size={16}/>  {tr("Kennzeichen fotografieren")}</button>}
    <form className="bsc-manual" onSubmit={e=>{e.preventDefault();if(normalizePlate(manual).length>=2)onFound({kind:'plate',value:manual.trim()})}}>
      <label className="bsc-lab">{tr("Kennzeichen manuell")}<input value={manual} onChange={e=>setManual(e.target.value.slice(0,16))} autoCapitalize="characters" autoCorrect="off" spellCheck={false} placeholder={tr("z. B. D AB 1234")}/></label>
      <button type="submit" className="bsc-btn" disabled={normalizePlate(manual).length<2}>{tr("Weiter")}</button>
    </form>
  </div>;
}
