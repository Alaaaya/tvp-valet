import {db} from '../api';
import type {Booking} from '../model';

export type CustomerCallBooking=Booking&{customer_called_at?:string|null;lifecycle_revision?:number};
export type CustomerCallReceipt={receipt_id:string;occurred_at:string;customer_called_at:string|null;lifecycle_revision:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Persist a confirmed call, not a phone-link click. Repeat needs an explicit UI confirmation.
 * Keep requestId AND original booking snapshot on network retry; reload booking after success.
 */
export async function recordCustomerCall({booking,requestId,allowRepeat=false}:{
 booking:CustomerCallBooking;requestId:string;allowRepeat?:boolean;
}):Promise<CustomerCallReceipt>{
 if(!uuid.test(requestId)||!uuid.test(booking.id))throw new Error('Ungültige Anfrage-ID');
 if(booking.customer_called_at===undefined||booking.lifecycle_revision===undefined||
  !Number.isSafeInteger(booking.lifecycle_revision)||booking.lifecycle_revision<0)
  throw new Error('Ungültiger Buchungsstand. Bitte neu laden.');
 if(booking.status!=='confirmed'||booking.checked_out_at)
  throw new Error('Anruf nur für offene bestätigte Buchungen.');
 if(booking.customer_called_at&&!allowRepeat)throw new Error('Erneuten Anruf bitte ausdrücklich bestätigen.');
 if(!db)throw new Error('Backend nicht eingerichtet');
 const {data,error}=await db.rpc('record_booking_customer_call',{
  p_request_id:requestId,p_booking_id:booking.id,
  p_expected_called_at:booking.customer_called_at,
  p_expected_checked_out_at:booking.checked_out_at,
  p_expected_lifecycle_revision:booking.lifecycle_revision,p_allow_repeat:allowRepeat
 });
 if(error){
  if(error.code==='40001')throw new Error('Die Buchung wurde inzwischen geändert. Bitte neu laden.');
  if(error.code==='42501')throw new Error('Keine Berechtigung für diese Aktion.');
  throw new Error(error.message||'Anruf konnte nicht gespeichert werden');
 }
 if(!data||data.receipt_id!==requestId||!Number.isFinite(Date.parse(data.occurred_at))||
  (data.customer_called_at!==null&&!Number.isFinite(Date.parse(data.customer_called_at)))||
  !Number.isSafeInteger(data.lifecycle_revision)||data.lifecycle_revision<0)
  throw new Error('Keine Bestätigung vom Server');
 return data as CustomerCallReceipt;
}
