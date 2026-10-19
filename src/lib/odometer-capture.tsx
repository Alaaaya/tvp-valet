import {Fa} from './fa-icons';
import React,{useEffect,useRef,useState} from 'react';
import {Camera,X} from 'lucide-react';
import {t as tr} from './i18n';
import {validateImageFile} from './booking-scan-qr';

/** Device-local reference photo, not OCR and never an upload or booking mutation. */
export function OdometerCapture({onEdit}:{onEdit:()=>void}){
 const file=useRef<HTMLInputElement>(null),url=useRef(''),job=useRef(0);
 const[photo,setPhoto]=useState(''),[error,setError]=useState('');
 const clear=()=>{job.current++;if(url.current)URL.revokeObjectURL(url.current);url.current='';setPhoto('');setError('');if(file.current)file.current.value=''};
 useEffect(()=>()=>{job.current++;if(url.current)URL.revokeObjectURL(url.current)},[]);
 const choose=async(f:File)=>{
  const id=++job.current;setError('');
  try{
   validateImageFile(f);
   if(!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(f.type))throw Error(tr('Bitte ein Foto auswählen.'));
   const next=URL.createObjectURL(f);
   const image=new Image();image.src=next;
   try{await image.decode();if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>40e6)throw Error(tr('Das Foto hat zu viele Pixel. Bitte mit niedrigerer Auflösung aufnehmen.'))}
   catch(e){URL.revokeObjectURL(next);throw e}
   if(id!==job.current){URL.revokeObjectURL(next);return}
   if(url.current)URL.revokeObjectURL(url.current);url.current=next;setPhoto(next);
  }catch(e){if(id===job.current)setError(e instanceof Error?e.message:tr('Das Foto konnte nicht gelesen werden.'))}
 };
 return <div className="odometer-local" data-edge-back-exclude>
  <button type="button" className="bd-outline odometer-capture" onClick={()=>file.current?.click()}><Fa name="camera" size={12}/>{tr('Scan odometer')} <small>(beta)</small></button>
  <small className="odometer-note">{tr('Local photo only. Read the mileage and enter it with KM and comment. Nothing is saved automatically.')}</small>
  <input ref={file} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" aria-label={tr('Odometer photo')} onChange={e=>{const f=e.target.files?.[0];if(f)void choose(f)}}/>
  {error&&<small role="alert">{error}</small>}
  {photo&&<div className="odometer-preview"><img src={photo} alt={tr('Odometer photo')}/><p>{tr('Local photo only. Read the mileage and enter it with KM and comment. Nothing is saved automatically.')}</p><button type="button" className="bd-outline" onClick={onEdit}>{tr('+ KM and comment')}</button><button type="button" className="bd-outline" onClick={clear}><X size={15}/>{tr('Schließen')}</button></div>}
 </div>;
}
