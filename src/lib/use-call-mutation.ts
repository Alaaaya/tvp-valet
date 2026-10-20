import {useEffect,useRef,useState} from 'react';
import {CustomerCallConflictError,type CustomerCallBooking,type CustomerCallReceipt} from './customer-calls';
import {offlineClearCustomerCall as clearCustomerCall,offlineRecordCustomerCall as recordCustomerCall} from './offline-actions';
import {t as tr} from './i18n';
export const canClearCall=(b:CustomerCallBooking,known:boolean)=>known&&b.status==='confirmed'&&b.checked_out_at===null&&Number.isSafeInteger(b.lifecycle_revision)&&(b.lifecycle_revision??-1)>=0&&!!b.customer_called_at&&Number.isFinite(Date.parse(b.customer_called_at));
type Action='clear'|'record'|'repeat';
type Request={booking:CustomerCallBooking;requestId:string;action:Action};
export function useCallMutation(session:string,{reload,done,onReloaded}:{reload:()=>Promise<void>;onReloaded:()=>void;done:(action:Action,receipt:CustomerCallReceipt)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[stale,setStale]=useState(false),[retry,setRetry]=useState(false);
 const pending=useRef<Request|null>(null),saving=useRef(false),epoch=useRef(0),alive=useRef(true),last=useRef(session),blocked=useRef(false);
 // Invalidate synchronously, including an account change before effects run.
 if(last.current!==session){last.current=session;epoch.current++;pending.current=null;blocked.current=false;saving.current=false}
 useEffect(()=>{setBusy(false);setError('');setRetry(false);setStale(false)},[session]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++}},[]);
 const invalidate=()=>{epoch.current++;pending.current=null;blocked.current=false;saving.current=false;setBusy(false);setError('');setRetry(false);setStale(false)};
 const reset=()=>{if(saving.current)return;pending.current=null;blocked.current=false;setError('');setRetry(false);setStale(false)};
 async function run(booking:CustomerCallBooking,action:Action){
  if(saving.current)return;
  const gen=epoch.current,valid=()=>alive.current&&gen===epoch.current;
  saving.current=true;setBusy(true);setError('');
  try{
   if(blocked.current){await reload();if(valid()){blocked.current=false;pending.current=null;setStale(false);setRetry(false);onReloaded()}return}
   if(pending.current&&(pending.current.action!==action||pending.current.booking.id!==booking.id))return;
   const req=pending.current??(pending.current={booking:{...booking},requestId:crypto.randomUUID(),action});
   let receipt:CustomerCallReceipt;
   try{
    receipt=action==='clear'?await clearCustomerCall(req):await recordCustomerCall({...req,allowRepeat:action==='repeat'});
   }catch(e){
    if(!valid())return;
    if(e instanceof CustomerCallConflictError){pending.current=null;blocked.current=true;setRetry(false);setStale(true);setError(e.message);try{await reload()}catch(r){if(valid())setError((r instanceof Error?r.message:String(r))+' '+tr("Bitte erneut versuchen."))}return}
    throw e;
   }
   if(!valid())return;
   pending.current=null;setRetry(false);
   done(action,receipt); // Close confirmation before refresh. A refresh failure never replays the mutation.
   await reload();
  }catch(e){if(valid()){setRetry(!!pending.current);setError(e instanceof Error?e.message:String(e))}}
  finally{if(valid()){saving.current=false;setBusy(false)}}
 }
 return {busy,error,stale,retry,run,reset,invalidate};
}
