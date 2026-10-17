import {db} from '../api';
import type {Booking} from '../model';

type ActionBooking=Booking&{lifecycle_revision?:number;detail_revision?:number};
type ActionInput={booking:ActionBooking;requestId:string};
export type BookingLocationHistory={id:number;occurred_at:string;actor_id:string|null;actor_name:string|null;old_spot:string|null;new_spot:string|null};
export type BookingCallHistory={id:number;occurred_at:string;actor_id:string;actor_name:string|null};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validId(id:string){if(!uuid.test(id))throw new Error('Ungültige Anfrage-ID');}
function failure(error:{code?:string;message?:string}):Error{
 if(error.code==='40001')return new Error('Die Buchung wurde inzwischen geändert. Bitte neu laden.');
 if(error.code==='42501')return new Error('Keine Berechtigung für diese Aktion.');
 return new Error(error.message||'Aktion fehlgeschlagen');
}
async function apply({booking,requestId}:ActionInput,action:'status'|'spot',target:string):Promise<ActionBooking>{
 validId(requestId);validId(booking.id);
 if(!db)throw new Error('Backend nicht eingerichtet');
 const revision=booking.lifecycle_revision;
 const detailRevision=booking.detail_revision;
 if(revision===undefined||!Number.isSafeInteger(revision)||revision<0||detailRevision===undefined||!Number.isSafeInteger(detailRevision)||detailRevision<0)throw new Error('Ungültiger Buchungsstand. Bitte neu laden.');
 const {data,error}=await db.rpc('apply_booking_detail_action',{
  p_request_id:requestId,p_booking_id:booking.id,p_action:action,p_target:target,
  p_expected:{status:booking.status,checked_in_at:booking.checked_in_at,checked_out_at:booking.checked_out_at,spot:booking.spot??'',lifecycle_revision:revision,detail_revision:detailRevision}
 });
 if(error)throw failure(error);
 if(!data||data.id!==booking.id||!Number.isSafeInteger(data.detail_revision)||data.detail_revision<0)throw new Error('Keine Bestätigung vom Server');
 return {...data,...Object.fromEntries(['external_id','phone','email','plate','product','flight_in','flight_out','key_cash','spot','comment'].map(k=>[k,data[k]??''])),lifecycle_revision:revision} as ActionBooking;
}
export async function transitionBookingStatus(input:ActionInput&{status:'no_show'|'cancelled'}):Promise<ActionBooking>{
 if(!['no_show','cancelled'].includes(input.status))throw new Error('Ungültiger Status');
 if(input.booking.checked_in_at||input.booking.checked_out_at)throw new Error('Bitte zuerst Check-out und Check-in ausdrücklich rückgängig machen.');
 if(input.booking.status!=='confirmed')throw new Error('Die Buchung ist nicht bestätigt.');
 return apply(input,'status',input.status);
}
export async function changeBookingSpot(input:ActionInput&{spot:string}):Promise<ActionBooking>{
 const spot=input.spot.trim();
 if(!spot||spot.length>100)throw new Error('Bitte einen Stellplatz mit 1 bis 100 Zeichen angeben.');
 if(input.booking.status!=='confirmed'||input.booking.checked_out_at)throw new Error('Standortänderung nur für offene bestätigte Buchungen.');
 if(spot===(input.booking.spot??''))throw new Error('Der Stellplatz ist unverändert.');
 return apply(input,'spot',spot);
}
async function history<T>(id:string,rpc:string):Promise<T[]>{
 validId(id);if(!db)throw new Error('Backend nicht eingerichtet');
 const {data,error}=await db.rpc(rpc,{p_booking_id:id});
 if(error)throw failure(error);
 if(!Array.isArray(data))throw new Error('Verlauf konnte nicht geladen werden');
 return data as T[];
}
export const loadBookingLocationHistory=(id:string)=>history<BookingLocationHistory>(id,'booking_location_history');
/** Recorded customer_called actions only. A tel: click is not proof of a completed call. */
export const loadBookingCallHistory=(id:string)=>history<BookingCallHistory>(id,'booking_call_history');
