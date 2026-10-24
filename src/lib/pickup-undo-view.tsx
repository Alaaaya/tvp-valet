import {t as tr} from './i18n';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Undo2,MoreHorizontal} from 'lucide-react';
import type {Booking} from '../model';
import type {BookingOperations} from './operations';
import {trapTab} from './undo-controls';
import {preparePickupUndo,clearPickupMark,PickupUndoError,type PickupSnapshot} from './pickup-undo';

export const HOLD_MS=650,MOVE_PX=10;
export interface HoldOptions{ms?:number;movePx?:number;onHold:()=>void;enabled?:boolean}
/** Long press that never fires on scroll/move, release, cancel, leave or blur. Spread the handlers on a wrapper element. */
export function useHold({ms=HOLD_MS,movePx=MOVE_PX,onHold,enabled=true}:HoldOptions){
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null),start=useRef<{x:number;y:number;id:number}|null>(null),fired=useRef(false),cb=useRef(onHold);cb.current=onHold;
 const cancel=useCallback(()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;start.current=null},[]);
 useEffect(()=>{window.addEventListener('scroll',cancel,true);window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',cancel);return()=>{cancel();window.removeEventListener('scroll',cancel,true);window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',cancel)}},[cancel]);
 useEffect(()=>{if(!enabled)cancel()},[enabled,cancel]);
 const fire=()=>{if(fired.current)return;fired.current=true;cb.current()};
 return{
  onPointerDown:(e:React.PointerEvent)=>{if(!enabled||(e.pointerType==='mouse'&&e.button!==0)||e.isPrimary===false)return;cancel();fired.current=false;start.current={x:e.clientX,y:e.clientY,id:e.pointerId};timer.current=setTimeout(()=>{timer.current=null;start.current=null;fire()},ms)},
  onPointerMove:(e:React.PointerEvent)=>{const s=start.current;if(!s||s.id!==e.pointerId)return;if(Math.hypot(e.clientX-s.x,e.clientY-s.y)>movePx)cancel()},
  onPointerUp:cancel,onPointerCancel:cancel,onPointerLeave:cancel,onBlur:cancel,
  onContextMenu:(e:React.MouseEvent)=>{if(!enabled)return;e.preventDefault();cancel()},
 };
}

type Phase='menu'|'loading'|'confirm'|'saving';
/** Two explicit steps: pick the undo option, then confirm the exact mark. Nothing is optimistic; reload happens in onDone. */
export function PickupUndoDialog({booking,ops,onClose,onDone}:{booking:Booking;ops:BookingOperations;onClose:()=>void;onDone:(bookingId:string)=>void|Promise<void>}){
 const[phase,setPhase]=useState<Phase>('menu'),[err,setErr]=useState(''),[dead,setDead]=useState(false);
 const snap=useRef<PickupSnapshot|null>(null),alive=useRef(true),busy=useRef(false),dlg=useRef<HTMLDivElement>(null),first=useRef<HTMLButtonElement>(null),origin=useRef({id:booking.id,at:ops.taken_away_at});
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{first.current?.focus()},[phase]);
 // account/booking switch while open: close and drop the snapshot, never act on the old one
 useEffect(()=>{if(booking.id!==origin.current.id||ops.taken_away_at!==origin.current.at){snap.current=null;onClose()}},[booking.id,ops.taken_away_at,onClose]);
 const close=()=>{if(busy.current)return;snap.current=null;onClose()};
 const keys=(e:React.KeyboardEvent)=>{
  if(e.key==='Escape'){e.stopPropagation();close();return}
  if(e.key!=='Tab')return;
  const f=Array.from(dlg.current?.querySelectorAll<HTMLElement>('button:not(:disabled)')||[]);
  if(!f.length){e.preventDefault();dlg.current?.focus();return}
  const i=f.indexOf(document.activeElement as HTMLElement);e.preventDefault();f[trapTab(i,f.length,e.shiftKey)].focus();
 };
 async function choose(){
  if(busy.current)return;busy.current=true;setErr('');setPhase('loading');
  try{const s=await preparePickupUndo(booking,ops);if(!alive.current)return;snap.current=s;setPhase('confirm')}
  catch(e){if(!alive.current)return;setErr(e instanceof Error?e.message:String(e));setDead(e instanceof PickupUndoError&&e.stale);setPhase('menu')}
  finally{busy.current=false}
 }
 async function confirm(){
  const s=snap.current;if(!s||busy.current)return;busy.current=true;setErr('');setPhase('saving');
  try{await clearPickupMark(s);snap.current=null;if(alive.current){await onDone(s.bookingId)}}
  catch(e){if(!alive.current)return;const st=e instanceof PickupUndoError&&e.stale;if(st){snap.current=null;setDead(true)}setErr(e instanceof Error?e.message:String(e));setPhase(st?'menu':'confirm')}
  finally{busy.current=false}
 }
 const working=phase==='loading'||phase==='saving';
 return <div className="undo-scrim pickup-undo-scrim" onClick={close}><div ref={dlg} tabIndex={-1} onKeyDown={keys} className="undo-dlg pickup-undo-dlg" role="alertdialog" aria-modal="true" aria-labelledby="pu-t" aria-describedby="pu-d" onClick={e=>e.stopPropagation()}>
  <h3 id="pu-t">{phase==='confirm'||phase==='saving'?tr("Abholung wirklich rückgängig machen?"):tr("Abholung")}</h3>
  <p id="pu-d">{phase==='confirm'||phase==='saving'?tr("Die Markierung „Als abgeholt markiert“ wird entfernt. Alle anderen Angaben bleiben unverändert."):tr("Diese Buchung ist als abgeholt markiert.")}</p>
  {err&&<div className="undo-err" role="alert">{err}</div>}
  <button ref={first} type="button" className="undo-cancel" disabled={working} onClick={close}>{dead?tr("Schließen"):tr("Abbrechen")}</button>
  {(phase==='menu'||phase==='loading')&&!dead&&<button type="button" className="undo-ok" disabled={working} aria-busy={phase==='loading'} onClick={choose}><Undo2 size={18}/> {phase==='loading'?tr("Wird geprüft …"):tr("Abholung rückgängig machen")}</button>}
  {(phase==='confirm'||phase==='saving')&&<button type="button" className="undo-ok" disabled={working} aria-busy={phase==='saving'} onClick={confirm}>{phase==='saving'?tr("Wird rückgängig gemacht …"):err?tr("Erneut versuchen"):tr("Ja, rückgängig machen")}</button>}
 </div></div>;
}
export function PickupMenuButton({onClick}:{onClick:()=>void}){
 return <button type="button" className="pickup-more" aria-haspopup="dialog" aria-label={tr("Abholung rückgängig machen …")} title={tr("Abholung rückgängig machen …")} onClick={onClick}><MoreHorizontal size={18}/></button>;
}
