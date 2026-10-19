import {t as tr} from './i18n';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import '../booking-edit.css';
import {ArrowLeft,CalendarDays,Car,MessageSquare,Pencil,Save,User,X,Minus,Plus} from 'lucide-react';
import {formatInTimeZone,fromZonedTime} from 'date-fns-tz';
import type {Booking} from '../model';
import {displayComment} from './comments';
import {useEdgeBack} from './use-edge-back';

const TZ='Europe/Berlin';
/** Optional fields parent/backend will persist; extension until model.ts is updated. */
export type EditableBooking=Booking&{first_name?:string|null;last_name?:string|null;car_description?:string|null};
export type EditRole='admin'|'driver';
export interface EditDraft{first_name:string;last_name:string;phone:string;email:string;persons:number;plate:string;car_description:string;key_cash:string;spot:string;km:string;
 arrival_date:string;arrival_time:string;departure_date:string;departure_time:string;flight_in:string;flight_out:string;new_comment:string;namesTouched:boolean;personsTouched:boolean}
export interface EditPatch{patch:Partial<EditableBooking>}

const d=(v:string)=>formatInTimeZone(v,TZ,'yyyy-MM-dd'),t=(v:string)=>formatInTimeZone(v,TZ,'HH:mm');
/** null for partial, invalid or nonexistent (DST gap) local times; verified by round trip. */
export function toBerlinIso(date:string,time:string):string|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return null;
 try{const z=fromZonedTime(date+'T'+time,TZ);if(Number.isNaN(z.getTime()))return null;
  return formatInTimeZone(z,TZ,"yyyy-MM-dd'T'HH:mm")===date+'T'+time?z.toISOString():null}catch{return null}
}

/** Legacy customer_name is never split: first/last start empty unless explicit fields exist. */
export function toDraft(b:EditableBooking):EditDraft{
 return{first_name:b.first_name||'',last_name:b.last_name||'',phone:b.phone||'',email:b.email||'',persons:b.persons,plate:b.plate||'',car_description:b.car_description||'',
  key_cash:b.key_cash||'',spot:b.spot||'',km:b.km==null?'':String(b.km),arrival_date:d(b.arrival_at),arrival_time:t(b.arrival_at),departure_date:d(b.departure_at),departure_time:t(b.departure_at),
  flight_in:b.flight_in||'',flight_out:b.flight_out||'',new_comment:'',namesTouched:false,personsTouched:false};
}
const NAMES:(keyof EditDraft)[]=['first_name','last_name'];
export function isDirty(b:EditableBooking,x:EditDraft):boolean{
 const o=toDraft(b);return (Object.keys(o) as (keyof EditDraft)[]).some(k=>k!=='namesTouched'&&k!=='personsTouched'&&o[k]!==x[k]);
}
export function validate(b:EditableBooking,x:EditDraft):string[]{
 const e:string[]=[];
 const a=toBerlinIso(x.arrival_date,x.arrival_time),r=toBerlinIso(x.departure_date,x.departure_time);
 if(!a||!r)e.push(tr("Gültiges Datum und gültige Uhrzeit erforderlich (nicht existierende Ortszeit nicht erlaubt)"));
 else if(Date.parse(r)<Date.parse(a))e.push(tr("Rückgabe muss nach der Annahme liegen"));
 const o=toDraft(b);
 if(x.first_name.length>120||x.last_name.length>120)e.push(tr("Vor- und Nachname: maximal 120 Zeichen"));
 if(x.car_description.length>500)e.push(tr("Fahrzeugbeschreibung: maximal 500 Zeichen"));
 if(o.plate!==x.plate&&!x.plate.trim())e.push(tr("Kennzeichen darf nicht leer sein"));
 if(NAMES.some(k=>o[k]!==x[k])&&!x.first_name.trim()&&!x.last_name.trim())e.push(tr("Name darf nicht leer sein"));
 const legacyUntouched=b.persons===0&&x.persons===0;
 if(!legacyUntouched&&(!Number.isInteger(x.persons)||x.persons<1))e.push(tr("Personen: mindestens 1"));
 if(x.km!==''&&!(/^\d+$/.test(x.km.trim())&&Number.isSafeInteger(Number(x.km))))e.push(tr("Kilometerstand ungültig"));
 return e;
}
/** Human note goes before any import provenance block so displayComment keeps both. */
export function appendComment(raw:string,note:string):string{
 const n=note.trim();if(!n)return raw;
 const lines=(raw||'').split(/\r?\n/);
 const i=lines.findIndex(l=>/^\s*(ParkingPro source\b|Fahrzeug\s*:|Standort\s*:|\{)/i.test(l));
 if(i<0)return raw.trim()?raw.replace(/\s+$/,'')+'\n'+n:n;
 return [...lines.slice(0,i),n,...lines.slice(i)].join('\n');
}
const ADMIN_ONLY=['first_name','last_name','phone','email','persons','plate','car_description','arrival_date','arrival_time','departure_date','departure_time','flight_in','flight_out'];
export const canEdit=(role:EditRole,field:keyof EditDraft)=>role==='admin'||!ADMIN_ONLY.includes(field as string);

/** Only changed, permitted fields. Names only when explicitly typed (never guessed from customer_name). */
export function buildPatch(b:EditableBooking,x:EditDraft,role:EditRole):Partial<EditableBooking>{
 const o=toDraft(b),p:Partial<EditableBooking>={};const ch=(k:keyof EditDraft)=>canEdit(role,k)&&o[k]!==x[k];
 if(NAMES.some(ch)){p.first_name=x.first_name.trim();p.last_name=x.last_name.trim();p.customer_name=[p.first_name,p.last_name].filter(Boolean).join(' ')}
 for(const k of ['phone','email','plate','car_description','flight_in','flight_out','key_cash','spot'] as const)if(ch(k))(p as any)[k]=x[k].trim();
 if(ch('persons'))p.persons=x.persons;
 if(ch('km'))p.km=x.km.trim()===''?null:Number(x.km);
 if(ch('arrival_date')||ch('arrival_time'))p.arrival_at=toBerlinIso(x.arrival_date,x.arrival_time)||undefined;
 if(ch('departure_date')||ch('departure_time'))p.departure_at=toBerlinIso(x.departure_date,x.departure_time)||undefined;
 if(x.new_comment.trim())p.comment=appendComment(b.comment,x.new_comment);
 return p;
}

export interface BookingEditViewProps{booking:EditableBooking;role:EditRole;onBack:()=>void;onSave:(patch:Partial<EditableBooking>)=>Promise<void>|void;/** parent must block backdrop/outside dismissal while true */onDirtyChange?:(dirty:boolean)=>void}
export function BookingEditView({booking,role,onBack,onSave,onDirtyChange}:BookingEditViewProps){
 const [x,setX]=useState(()=>toDraft(booking));const [err,setErr]=useState('');const [busy,setBusy]=useState(false);const [ask,setAsk]=useState(false);const [dateEdit,setDateEdit]=useState({in:false,out:false});
 const dirty=useMemo(()=>isDirty(booking,x),[booking,x]);const problems=validate(booking,x);const can=dirty&&!problems.length&&!busy;
 const set=(k:keyof EditDraft,v:string|number)=>setX(s=>({...s,[k]:v}));
 const root=useRef<HTMLDivElement>(null),dlg=useRef<HTMLDivElement>(null),opener=useRef<HTMLElement|null>(null),inflight=useRef(false);
 useEffect(()=>{onDirtyChange?.(dirty)},[dirty]);useEffect(()=>()=>onDirtyChange?.(false),[]);
 useEffect(()=>{if(ask){opener.current=document.activeElement as HTMLElement|null;dlg.current?.querySelector('button')?.focus()}else opener.current?.focus?.()},[ask]);
 const trap=(e:React.KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setAsk(false);return}if(e.key!=='Tab')return;const bs=Array.from(dlg.current?.querySelectorAll('button')||[]) as HTMLElement[];if(!bs.length)return;const f=bs[0],l=bs[bs.length-1];if(e.shiftKey&&document.activeElement===f){e.preventDefault();l.focus()}else if(!e.shiftKey&&document.activeElement===l){e.preventDefault();f.focus()}else if(!dlg.current?.contains(document.activeElement)){e.preventDefault();f.focus()}};
 useEdgeBack(root,{enabled:true,priority:30,blocked:ask||busy,onBack:()=>{if(busy||inflight.current)return false;if(dirty){setAsk(true);return false}onBack()}});
 const legacy=!x.first_name&&!x.last_name&&booking.customer_name.trim();
 const save=async()=>{if(!can||inflight.current)return;inflight.current=true;setBusy(true);setErr('');try{await onSave(buildPatch(booking,x,role))}catch(e){setErr(e instanceof Error?e.message:String(e))}finally{inflight.current=false;setBusy(false)}};
 const back=()=>{if(busy||inflight.current)return;dirty?setAsk(true):onBack()};
 const inp=(k:keyof EditDraft,label:string,o:{type?:string;clear?:boolean}={})=>{const dis=!canEdit(role,k);return <label className="be-field"><span>{label}</span><span className="be-wrap"><input type={o.type||'text'} value={String(x[k])} disabled={dis} maxLength={k==='first_name'||k==='last_name'?120:k==='car_description'?500:undefined} placeholder={label} onChange={e=>set(k,e.target.value)}/>{o.clear&&x[k]&&!dis&&<button type="button" className="be-clear" aria-label={label+' leeren'} onClick={()=>set(k,'')}><X size={14}/></button>}</span></label>};
 const when=(kind:'in'|'out')=>{const p=kind==='in'?'arrival':'departure',f=kind==='in'?'flight_in':'flight_out',dis=!canEdit(role,(p+'_date') as keyof EditDraft),open=dateEdit[kind]&&!dis;
  return <section className="be-card be-date"><header><h3><CalendarDays size={18}/>{kind==='in'?tr("Parking date"):tr("Return date")}</h3><button type="button" aria-label={(kind==='in'?tr("Parking date"):tr("Return date"))+' bearbeiten'} disabled={dis} aria-expanded={open} onClick={()=>setDateEdit(s=>({...s,[kind]:!s[kind]}))}><Pencil size={16}/></button></header>
  <div className="be-row"><input type="date" aria-label={(kind==='in'?tr("Parking date"):tr("Return date"))+' Datum'} disabled={!open} value={String(x[(p+'_date') as keyof EditDraft])} onChange={e=>set((p+'_date') as keyof EditDraft,e.target.value)}/><input type="time" aria-label={(kind==='in'?tr("Parking date"):tr("Return date"))+' Uhrzeit'} disabled={!open} value={String(x[(p+'_time') as keyof EditDraft])} onChange={e=>set((p+'_time') as keyof EditDraft,e.target.value)}/></div>
  {inp(f,tr("Flight number"))}</section>};
 return <div ref={root} className="be-screen"><header className="be-head"><button type="button" className="be-back" aria-label={tr("Zurück")} disabled={busy} onClick={back}><ArrowLeft size={20}/></button><h2>{tr("Edit")}</h2><button type="button" className="be-save" disabled={!can} onClick={save}>{tr("Save")}</button></header>
 <div className="be-ext">{tr("Extern ID:")}{booking.external_id||booking.code}</div>
 {err&&<div className="be-err" role="alert">{err}</div>}
 <div className="be-body">
 <section className="be-card"><h3><User size={18}/>{tr("Customer details")}</h3>
  <div className="be-row">{inp('first_name',tr("First name"))}{inp('last_name',tr("Last name"))}</div>
  {legacy&&<small className="be-note">{tr("Gespeicherter Name (alt):")}{booking.customer_name}. Vor- und Nachname werden nicht automatisch getrennt.</small>}
  {inp('phone',tr("Phone"),{type:'tel',clear:true})}{inp('email',tr("Mail address"),{type:'email',clear:true})}
  <div className="be-stepper"><span><b>{x.persons}</b> {x.persons===1?'person':'persons'}</span><button type="button" aria-label={tr("Weniger Personen")} disabled={!canEdit(role,'persons')||x.persons<=1} onClick={()=>set('persons',x.persons-1)}><Minus size={18}/></button><button type="button" aria-label={tr("Mehr Personen")} disabled={!canEdit(role,'persons')} onClick={()=>set('persons',x.persons+1)}><Plus size={18}/></button></div></section>
 <section className="be-card"><h3><Car size={18}/>{tr("Car details")}</h3>{inp('plate',tr("License Plate"))}{inp('car_description',tr("Car description"))}{inp('key_cash',tr("Key code"))}{inp('km',tr("Mileage"),{type:'number'})}{inp('spot',tr("Spot"))}</section>
 {when('in')}{when('out')}
 <section className="be-card"><h3><MessageSquare size={18}/>{tr("Add internal comment")}</h3>{(()=>{const c=displayComment(booking.comment).text;return c?<p className="be-existing">{c}</p>:null})()}<label className="be-field"><span>{tr("Comment")}</span><textarea rows={4} value={x.new_comment} placeholder={tr("Comment")} onChange={e=>set('new_comment',e.target.value)}/></label></section>
 {dirty&&problems.map(p=><p key={p} className="be-err" role="alert">{p}</p>)}
 </div>
 <footer className="be-foot"><button type="button" className="be-update" disabled={!can} onClick={save}><Save size={18}/>{busy?tr("Wird gespeichert …"):tr("Update booking")}</button></footer>
 {ask&&<div className="be-dialog" role="alertdialog" aria-modal="true" aria-label={tr("Ungespeicherte Änderungen")} ref={dlg} onKeyDown={trap}><div><p>{tr("Ungespeicherte Änderungen verwerfen?")}</p><button type="button" onClick={()=>setAsk(false)}>{tr("Weiter bearbeiten")}</button><button type="button" className="danger" disabled={busy} onClick={onBack}>{tr("Verwerfen")}</button></div></div>}
 </div>;
}
