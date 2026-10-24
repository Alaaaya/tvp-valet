import {t as tr} from './i18n';
import {db} from '../api';
import type {Booking} from '../model';
import type {BookingOperations} from './operations';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Everything the RPC needs to prove the user confirmed exactly this pickup mark. Strings are kept verbatim (microseconds). */
export interface PickupSnapshot{bookingId:string;eventId:string;takenAwayAt:string;revision:number;checkedInAt:string;checkedOutAt:string|null}
export class PickupUndoError extends Error{constructor(message:string,readonly stale=false){super(message);this.name='PickupUndoError'}}
/** Canonical microsecond UTC key so '…+00:00', '…Z' and shortened fractions compare equal. null if not a timestamp. */
export function tsKey(v:unknown):string|null{
 if(typeof v!=='string')return null;
 const m=v.trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/);
 if(!m)return null;
 let off=0;if(m[6]!=='Z'){const o=m[6].replace(':',''),s=o[0]==='-'?-1:1;off=s*(+o.slice(1,3)*60+(+o.slice(3,5)||0))}
 const ms=Date.parse(m[1]+'T'+m[2]+':'+m[3]+':'+m[4]+'Z')-off*60000;
 return Number.isNaN(ms)?null:ms+'.'+(m[5]||'').padEnd(6,'0');
}
export const sameInstant=(a:unknown,b:unknown)=>{const x=tsKey(a),y=tsKey(b);return x!==null&&x===y};
export const isPickupMarked=(b:Booking,o?:BookingOperations|null)=>!!o?.taken_away_at&&b.status==='confirmed'&&!!b.checked_in_at;
const eventKey=(id:unknown):string|null=>{if(typeof id==='number'&&!Number.isSafeInteger(id))return null;const v=String(id);return /^[1-9][0-9]*$/.test(v)&&BigInt(v)<=9223372036854775807n?v:null};
const stale=()=>new PickupUndoError(tr("Die Buchung wurde inzwischen geändert. Bitte schließen, neu laden und erneut prüfen."),true);
const online=()=>typeof navigator==='undefined'||navigator.onLine!==false;
const offlineErr=()=>new PickupUndoError(tr("Zum Rückgängigmachen ist eine Internetverbindung nötig."));
const noDb=()=>new PickupUndoError(tr("Backend nicht eingerichtet."));
/** Reads fresh server state and the exact original taken_away event. Fails closed on anything unclear. */
export async function preparePickupUndo(booking:Booking,ops:BookingOperations|null|undefined):Promise<PickupSnapshot>{
 if(!online())throw offlineErr();
 if(!db)throw noDb();
 if(!isPickupMarked(booking,ops))throw new PickupUndoError(tr("Diese Abholung kann nicht rückgängig gemacht werden."));
 const [b,o,e]=await Promise.all([
  db.from('bookings').select('id,status,checked_in_at,checked_out_at,booking_handover_undos(count)').eq('id',booking.id).maybeSingle(),
  db.from('booking_operations').select('booking_id,taken_away_at').eq('booking_id',booking.id).maybeSingle(),
  db.from('booking_operation_events').select('id:id::text,booking_id,action,occurred_at,undone_at').eq('booking_id',booking.id).eq('action','taken_away').is('undone_at',null),
 ]);
 if(b.error)throw new PickupUndoError(b.error.message);if(o.error)throw new PickupUndoError(o.error.message);if(e.error)throw new PickupUndoError(e.error.message);
 const fb=b.data as {id:string;status:string;checked_in_at:string|null;checked_out_at:string|null;booking_handover_undos?:{count:number}[]}|null;
 const fo=o.data as {taken_away_at:string|null}|null;
 if(!fb||!fo||fb.id!==booking.id)throw stale();
 // The server must still agree with what the user is looking at.
 if(fb.status!=='confirmed'||!fb.checked_in_at||!((fb.checked_out_at===null&&booking.checked_out_at==null)||sameInstant(fb.checked_out_at,booking.checked_out_at))||!fo.taken_away_at||!sameInstant(fo.taken_away_at,ops!.taken_away_at)
  ||!sameInstant(fb.checked_in_at,booking.checked_in_at))throw stale();
 const hits=((e.data||[]) as {id:string|number;booking_id:string;action:string;occurred_at:string}[]).filter(x=>x.booking_id===booking.id&&x.action==='taken_away'&&sameInstant(x.occurred_at,fo.taken_away_at));
 if(hits.length!==1||!eventKey(hits[0].id))throw new PickupUndoError(tr("Die ursprüngliche Abholmarkierung wurde nicht eindeutig gefunden. Nichts wurde geändert."),true);
 const revision=fb.booking_handover_undos?.[0]?.count;
 if(typeof revision!=='number')throw stale();
 return{bookingId:booking.id,eventId:eventKey(hits[0].id)!,takenAwayAt:fo.taken_away_at,revision,checkedInAt:fb.checked_in_at,checkedOutAt:fb.checked_out_at};
}
/** Sends exactly the confirmed snapshot. Never queued; offline or any error leaves everything untouched. Safe to retry with the same snapshot. */
export async function clearPickupMark(s:PickupSnapshot):Promise<void>{
 if(!online())throw offlineErr();
 if(!db)throw noDb();
 if(!uuid.test(s.bookingId)||!eventKey(s.eventId)||!tsKey(s.takenAwayAt)||!tsKey(s.checkedInAt)||!Number.isSafeInteger(s.revision)||s.revision<0||(s.checkedOutAt!==null&&!tsKey(s.checkedOutAt)))throw new PickupUndoError(tr("Ungültige Rücknahme."));
 const {data,error}=await db.rpc('clear_booking_taken_away',{
  p_booking_id:s.bookingId,p_event_id:s.eventId,p_expected_taken_away_at:s.takenAwayAt,
  p_expected_lifecycle_revision:s.revision,p_expected_checked_in_at:s.checkedInAt,p_expected_checked_out_at:s.checkedOutAt});
 if(error){if(['PT409','40001'].includes(error.code))throw stale();throw new PickupUndoError(error.message||tr("Rücknahme fehlgeschlagen."))}
 if(!data)throw new PickupUndoError(tr("Keine Bestätigung erhalten. Bitte mit derselben Rücknahme erneut versuchen."));
}
