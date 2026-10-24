import {t as tr} from './i18n';
import {db} from '../api';
import {offlineSnapshot} from './offline-client';
import type {MediaItem} from './handover-api';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Disabled by default. Deployment and database approval are separate from building UI. */
export function mediaDeleteEnabled(){return import.meta.env.VITE_MEDIA_DELETE_V4==='true'&&!!gatewayUrl()}
function gatewayUrl(){try{const u=new URL(import.meta.env.VITE_MEDIA_DELETE_GATEWAY_URL||'');if(u.pathname!=='/v4/media-delete'||u.search||u.hash||u.username||u.password)return '';if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))return '';return u.href}catch{return ''}}
export type DeleteInput={requestId:string;bookingId:string;item:MediaItem;confirmed:true;reason:string};
export type DeleteResult={request_id:string;deleted:true;status:'api_absence_observed';bytes_erasure_verified:false};
export class DeleteDenied extends Error{constructor(){super(tr("Löschen nicht erlaubt. Nur Administratoren dürfen Medien löschen."));this.name='DeleteDenied'}}
// Ephemeral retry context only. Never persisted, queued, or rendered as history.
const intents=new Map<string,{account:string;booking:string;path:string;reason:string;objectId:string}>();
export async function deleteBookingMedia({requestId,bookingId,item,confirmed,reason}:DeleteInput):Promise<DeleteResult>{
 if(!mediaDeleteEnabled())throw Error(tr("Medienlöschung ist noch nicht freigegeben."));
 const initial=offlineSnapshot();if(!initial.online||!initial.ready||!initial.accountId)throw Error(tr("Offline: Löschen ist nur online möglich."));
 if(!uuid.test(requestId)||!uuid.test(bookingId)||confirmed!==true||!reason.trim()||reason.trim().length>500)throw Error(tr("Ungültige Löschanfrage."));
 if(item.offline_pending||item.local_blob)throw Error(tr("Ausstehende lokale Medien können nicht gelöscht werden."));
 if(item.bucket&&item.bucket!=='booking-media'||!item.path.startsWith(bookingId+'/')||item.path.split('/').length!==2)throw Error(tr("Ungültige Löschanfrage."));
 if(!db)throw Error(tr("Backend nicht eingerichtet."));
 const d=db,account=initial.accountId;
 const active=()=>{const s=offlineSnapshot();if(s.accountId!==account||!s.ready||!s.online)throw new DeleteDenied()};
 const session=await d.auth.getSession();active();if(session.error||session.data.session?.user.id!==account||!session.data.session?.access_token)throw new DeleteDenied();
 let context=intents.get(requestId);
 if(context&&(context.account!==account||context.booking!==bookingId||context.path!==item.path||context.reason!==reason.trim()))throw Error(tr("Ungültige Löschanfrage."));
 if(!context){
  const name=item.path.slice(bookingId.length+1),matches=[];
  for(let offset=0;;offset+=100){const r=await d.storage.from('booking-media').list(bookingId,{search:name,limit:100,offset});active();if(r.error)throw Error(tr("Medienidentität konnte nicht bestätigt werden."));for(const f of r.data||[])if(f.name===name&&uuid.test(f.id||''))matches.push(f);if((r.data?.length||0)<100)break}
  if(matches.length!==1)throw Error(tr("Medienidentität konnte nicht bestätigt werden."));
  context={account,booking:bookingId,path:item.path,reason:reason.trim(),objectId:matches[0].id!};intents.set(requestId,context);
 }
 active();
 const response=await fetch(gatewayUrl(),{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer '+session.data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({p_request_id:requestId,p_booking_id:bookingId,p_object_id:context.objectId,p_path:item.path,p_confirmed:true,p_reason:context.reason}),signal:AbortSignal.timeout(30000)});
 active();const result=await response.json().catch(()=>null);active();
 if(response.status===401||response.status===403)throw new DeleteDenied();
 if(!response.ok||result?.request_id!==requestId||result?.deleted!==true||result?.status!=='api_absence_observed'||result?.bytes_erasure_verified!==false)throw Error(tr("Löschen nicht bestätigt. Das Medium wurde möglicherweise nicht entfernt."));
 intents.delete(requestId);return result as DeleteResult;
}
