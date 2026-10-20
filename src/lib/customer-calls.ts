import {t as tr} from './i18n';
import {db} from '../api';
import type {Booking} from '../model';

export type CustomerCallBooking=Booking&{customer_called_at?:string|null;lifecycle_revision?:number};
export type CustomerCallReceipt={receipt_id:string;occurred_at:string;customer_called_at:string|null;lifecycle_revision:number};
export class CustomerCallConflictError extends Error {
 readonly code='PT409';
 constructor(){super(tr("Die Buchung wurde inzwischen geändert. Bitte neu laden."));this.name='CustomerCallConflictError';}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Persist a confirmed call, not a phone-link click. Repeat needs an explicit UI confirmation.
 * Keep requestId AND original booking snapshot on network retry; reload booking after success.
 */
export async function recordCustomerCall({booking,requestId,allowRepeat=false}:{
 booking:CustomerCallBooking;requestId:string;allowRepeat?:boolean;
}):Promise<CustomerCallReceipt>{
 if(!uuid.test(requestId)||!uuid.test(booking.id))throw new Error(tr("Ungültige Anfrage-ID"));
 if(booking.customer_called_at===undefined||booking.lifecycle_revision===undefined||
  !Number.isSafeInteger(booking.lifecycle_revision)||booking.lifecycle_revision<0)
  throw new Error(tr("Ungültiger Buchungsstand. Bitte neu laden."));
 if(booking.status!=='confirmed'||booking.checked_out_at!==null)
  throw new Error(tr("Anruf nur für offene bestätigte Buchungen."));
 if(booking.customer_called_at&&!allowRepeat)throw new Error(tr("Erneuten Anruf bitte ausdrücklich bestätigen."));
 if(!db)throw new Error(tr("Backend nicht eingerichtet"));
 const {data,error}=await db.rpc('record_booking_customer_call',{
  p_request_id:requestId,p_booking_id:booking.id,
  p_expected_called_at:booking.customer_called_at,
  p_expected_checked_out_at:booking.checked_out_at,
  p_expected_lifecycle_revision:booking.lifecycle_revision,p_allow_repeat:allowRepeat
 });
 if(error){
  if((error.code==='PT409'||error.code==='40001'))throw new CustomerCallConflictError();
  if(error.code==='42501')throw new Error(tr("Keine Berechtigung für diese Aktion."));
  throw new Error(error.message||tr("Anruf konnte nicht gespeichert werden"));
 }
 if(!data||data.receipt_id!==requestId||!Number.isFinite(Date.parse(data.occurred_at))||
  (data.customer_called_at!==null&&!Number.isFinite(Date.parse(data.customer_called_at)))||
  !Number.isSafeInteger(data.lifecycle_revision)||data.lifecycle_revision<0)
  throw new Error(tr("Keine Bestätigung vom Server"));
 return data as CustomerCallReceipt;
}

/** Reset a recorded call time (customer_called_at -> null). Keeps call history as audit trail.
 * Same retry contract as recordCustomerCall: keep requestId AND original snapshot; reload after success.
 */
export async function clearCustomerCall({booking,requestId}:{
 booking:CustomerCallBooking;requestId:string;
}):Promise<CustomerCallReceipt>{
 if(!uuid.test(requestId)||!uuid.test(booking.id))throw new Error(tr("Ungültige Anfrage-ID"));
 if(booking.customer_called_at===undefined||booking.lifecycle_revision===undefined||
  !Number.isSafeInteger(booking.lifecycle_revision)||booking.lifecycle_revision<0)
  throw new Error(tr("Ungültiger Buchungsstand. Bitte neu laden."));
 if(booking.status!=='confirmed'||booking.checked_out_at!==null)
  throw new Error(tr("Anruf nur für offene bestätigte Buchungen."));
 if(!booking.customer_called_at||!Number.isFinite(Date.parse(booking.customer_called_at)))
  throw new Error(tr("Kein Anruf zum Löschen vorhanden."));
 if(!db)throw new Error(tr("Backend nicht eingerichtet"));
 const {data,error}=await db.rpc('clear_booking_customer_call',{
  p_request_id:requestId,p_booking_id:booking.id,
  p_expected_called_at:booking.customer_called_at,
  p_expected_lifecycle_revision:booking.lifecycle_revision
 });
 if(error){
  if((error.code==='PT409'||error.code==='40001'))throw new CustomerCallConflictError();
  if(error.code==='42501')throw new Error(tr("Keine Berechtigung für diese Aktion."));
  throw new Error(error.message||tr("Anruf konnte nicht gelöscht werden"));
 }
 if(!data||data.receipt_id!==requestId||!Number.isFinite(Date.parse(data.occurred_at))||
  (data.customer_called_at!==null&&(typeof data.customer_called_at!=='string'||!Number.isFinite(Date.parse(data.customer_called_at))))||
  !Number.isSafeInteger(data.lifecycle_revision)||data.lifecycle_revision<0)
  throw new Error(tr("Keine Bestätigung vom Server"));
 return data as CustomerCallReceipt;
}
