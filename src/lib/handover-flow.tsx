import React,{useEffect,useRef,useState} from 'react';
import {ChevronLeft,Info,Camera,Check,Star} from 'lucide-react';
import type {Booking} from '../model';
import {createPendingMedia,saveHandover,type HandoverDetails,type PendingMedia} from './handover-api';
import {CameraScreen} from './camera';
import {SignatureField,renderSignature,type Stroke} from './signature';
import {useEdgeBack} from './use-edge-back';

export function HandoverFlow({booking,action,onClose,onDone}:{booking:Booking;action:'in'|'out';onClose:()=>void;onDone:(b:Booking)=>void}){
  const[requestId]=useState(()=>crypto.randomUUID());
  const[step,setStep]=useState<'camera'|'details'>('camera'),[media,setMedia]=useState<PendingMedia[]>([]),[askLeave,setAskLeave]=useState(false);
  const[km,setKm]=useState(booking.km==null?'':String(booking.km)),[key,setKey]=useState(booking.key_cash||''),[flight,setFlight]=useState((action==='in'?booking.flight_in:booking.flight_out)||''),[poor,setPoor]=useState(false),[comment,setComment]=useState('');
  const[strokes,setStrokes]=useState<Stroke[]>([]),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[err,setErr]=useState('');
  const sig=useRef<{n:number;item:PendingMedia}|null>(null),saving=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;const o=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{alive.current=false;document.body.style.overflow=o}},[]);
  const root=useRef<HTMLDivElement>(null);
  useEdgeBack(root,{enabled:step==='details',priority:70,blocked:step==='camera'||askLeave||busy,onBack:()=>{setStep('camera')}});
  const label=action==='in'?'Check-in':'Check-out';
  const leave=()=>{if(busy)return;if(media.length||strokes.length||km||comment)setAskLeave(true);else onClose()};

  async function save(e:React.FormEvent){
    e.preventDefault();if(saving.current)return;
    const kmN=km.trim()===''?null:Number(km.replace(',','.'));
    if(kmN!==null&&(!Number.isFinite(kmN)||kmN<0||kmN>9999999)){setErr('Bitte einen gültigen Kilometerstand eingeben.');return}
    saving.current=true;setBusy(true);setErr('');setProgress('');
    try{
      let all=media;
      if(strokes.length){
        if(!sig.current||sig.current.n!==strokes.length){const blob=await renderSignature(strokes);sig.current={n:strokes.length,item:createPendingMedia(blob,'signature','signature.png')}}
        all=[...media,sig.current.item];
      }
      const details:HandoverDetails={km:kmN===null?null:Math.round(kmN),key_cash:key.trim(),flight_number:flight.trim(),comment:comment.trim(),poor_visibility:poor};
      const nb=await saveHandover({requestId,booking,action,details,media:all,onProgress:(d,t)=>{if(alive.current)setProgress('Wird hochgeladen … '+d+' / '+t)}});
      onDone(nb);
    }catch(ex){if(alive.current)setErr((ex instanceof Error?ex.message:String(ex))+' Bitte erneut speichern, bereits hochgeladene Medien bleiben erhalten.')}
    finally{saving.current=false;if(alive.current){setBusy(false);setProgress('')}}
  }
  // strokes signature key: count is enough because strokes only append or reset; reset+redraw with same count must regenerate
  const setS=(s:Stroke[])=>{sig.current=null;setStrokes(s)};

  return <div ref={root} className="ho">
    {step==='camera'&&<CameraScreen title={label+' · '+booking.plate} media={media} onAdd={m=>setMedia(x=>[...x,m])} onRemove={id=>setMedia(x=>x.filter(m=>m.id!==id))} onBack={leave} onDone={()=>setStep('details')}/>}
    {step==='details'&&<form className="ho-form" onSubmit={save} noValidate>
      <header><button type="button" className="ho-back" aria-label="Zurück zur Kamera" disabled={busy} onClick={()=>setStep('camera')}><ChevronLeft size={22}/></button><h2>Booking</h2><span/></header>
      {!media.length&&<div className="ho-banner" role="status"><Info size={17}/> You skipped media. Proceeding to signature.</div>}
      <div className="ho-body">
        <p className="ho-label">{label} details · {booking.plate}</p>
        <div className="ho-card">
          <div className="ho-row"><label htmlFor="ho-km">Car mileage</label><div className="ho-col"><input id="ho-km" inputMode="numeric" type="text" pattern="[0-9]*" autoComplete="off" placeholder="Fill in (optional)" value={km} onChange={e=>setKm(e.target.value.replace(/[^0-9]/g,''))}/><button type="button" className="ho-scan" disabled title="Kilometerstand bitte manuell eingeben"><Camera size={15}/> Scan odometer (unavailable)</button></div></div>
          <div className="ho-row"><label htmlFor="ho-key">Key code</label><input id="ho-key" type="text" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)}/></div>
          <div className="ho-row"><label htmlFor="ho-fl">{action==='in'?'Arrival':'Departure'} flight number</label><input id="ho-fl" type="text" autoCapitalize="characters" autoComplete="off" value={flight} onChange={e=>setFlight(e.target.value.toUpperCase())}/></div>
          <label className="ho-row ho-check"><input type="checkbox" checked={poor} onChange={e=>setPoor(e.target.checked)}/><span>Photos taken in poor visibility</span></label>
        </div>
        <p className="ho-label">Comments</p>
        <div className="ho-comment"><input type="text" aria-label="Neuer Kommentar" placeholder="Enter new comment" value={comment} onChange={e=>setComment(e.target.value)}/><Star size={18}/></div>
        <p className="ho-label">Customer signature <small>(optional)</small></p>
        <SignatureField strokes={strokes} onChange={setS}/>
        <p className="ho-meta">{media.length} Medien{strokes.length?' + Unterschrift':''} werden gespeichert.</p>
        {err&&<div className="ho-err" role="alert">{err}</div>}
      </div>
      <div className="ho-save"><button className="ho-savebtn" disabled={busy}>{busy?(progress||'Wird gespeichert …'):<>Save <Check size={18}/></>}</button></div>
    </form>}
    {askLeave&&<div className="ho-ask" role="alertdialog" aria-modal="true" aria-label="Abbrechen?"><div><h3>Vorgang abbrechen?</h3><p>Aufgenommene Medien und Eingaben gehen verloren.</p><button type="button" className="ho-savebtn" onClick={()=>setAskLeave(false)}>Weitermachen</button><button type="button" className="ho-discard" onClick={onClose}>Verwerfen</button></div></div>}
  </div>;
}
