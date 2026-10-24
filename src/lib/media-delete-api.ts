import {t as tr} from './i18n';
import {db} from '../api';
import type {MediaItem} from './handover-api';
/** Contract draft (backend ef00b11f): rpc admin_delete_booking_media(p_request_id uuid, p_booking_id uuid, p_media_id text, p_kind text, p_path text)
 *  -> {deleted:boolean, already_deleted?:boolean}. Admin only (server-enforced), immutable audit written server-side, never exposed to staff UI.
 *  p_request_id is the idempotency key: reuse it for retries of the same deletion. Error codes: 42501 not admin, PT404 unknown media, PT409 conflict. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type DeleteInput={requestId:string;bookingId:string;item:MediaItem};
export type DeleteResult={deleted:boolean;already_deleted?:boolean};
export class DeleteDenied extends Error{constructor(){super(tr("Löschen nicht erlaubt. Nur Administratoren dürfen Medien löschen."));this.name='DeleteDenied'}}
export async function deleteBookingMedia({requestId,bookingId,item}:DeleteInput):Promise<DeleteResult>{
 if(!uuid.test(requestId)||!uuid.test(bookingId))throw Error(tr("Ungültige Löschanfrage."));
 if(item.offline_pending||item.local_blob)throw Error(tr("Ausstehende lokale Medien können nicht gelöscht werden."));
 if(!db)throw Error(tr("Backend nicht eingerichtet."));
 const r=await db.rpc('admin_delete_booking_media',{p_request_id:requestId,p_booking_id:bookingId,p_media_id:item.id,p_kind:item.kind,p_path:item.path});
 if(r.error){const c=(r.error as {code?:string}).code;if(c==='42501')throw new DeleteDenied();if(c==='PT404')return{deleted:true,already_deleted:true};throw Error(tr("Löschen nicht bestätigt. Das Medium wurde möglicherweise nicht entfernt. ")+r.error.message)}
 if(!r.data||(r.data as DeleteResult).deleted!==true)throw Error(tr("Löschen nicht bestätigt. Das Medium wurde möglicherweise nicht entfernt."));
 return r.data as DeleteResult;
}
