import {db} from '../api';
import type {Booking} from '../model';

export type PaymentMethod='cash'|'card'|'bank_transfer';
export type BookingPayment={
 id:string;booking_id:string;actor_id:string;actor_name:string;method:PaymentMethod;
 amount_cents:number;expected_paid_cents:number;expected_total_cents:number;paid_after_cents:number;
 legacy_key_snapshot:string|null;occurred_at:string;transaction_id:number;
};
export type PaymentInput={booking:Booking;requestId:string;amountCents:number;method:PaymentMethod};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxCents=999999999999;
function validId(id:string){if(!uuid.test(id))throw new Error('Ungültige Anfrage-ID');}
function cents(value:number):number {
 if(!Number.isFinite(value)||value<0)throw new Error('Ungültiger Geldbetrag');
 const decimal=value.toFixed(2);
 const [whole,fraction]=decimal.split('.');
 const rounded=Number(whole)*100+Number(fraction);
 if(Number(decimal)!==value||!Number.isSafeInteger(rounded)||rounded>maxCents)
  throw new Error('Geldbeträge benötigen volle Cent');
 return rounded;
}
export function outstandingCents(booking:Pick<Booking,'total'|'paid'>):number {
 return Math.max(0,cents(booking.total)-cents(booking.paid));
}
/** Ambiguous digit-containing notes block cash rather than inventing an allocation. */
export function hasLegacyCashConflict(booking:Pick<Booking,'key_cash'>):boolean {
 return /[0-9]/.test(booking.key_cash??'');
}
function failure(error:{code?:string;message?:string}):Error {
 if(error.code==='PT409'||error.code==='40001')return new Error('Die Buchung wurde inzwischen geändert. Bitte neu laden.');
 if(error.code==='42501')return new Error('Keine Berechtigung für diese Zahlung.');
 return new Error(error.message||'Zahlung fehlgeschlagen');
}
/** Preserve the whole input when retrying after an uncertain response. Never generate a new ID automatically. */
export async function recordBookingPayment({booking,requestId,amountCents,method}:PaymentInput):Promise<BookingPayment> {
 validId(requestId);validId(booking.id);
 if(!['cash','card','bank_transfer'].includes(method))throw new Error('Ungültige Zahlungsart');
 if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>maxCents)throw new Error('Bitte einen positiven Betrag in Cent angeben');
 const paid=cents(booking.paid),total=cents(booking.total);
 if(amountCents>total-paid)throw new Error('Der Betrag übersteigt den offenen Restbetrag');
 if(booking.status!=='confirmed')throw new Error('Die Buchung ist nicht bestätigt');
 if(method==='cash'&&hasLegacyCashConflict(booking))throw new Error('Vorhandener Bargeld-/Schlüsselvermerk muss vor einer Barzahlung geklärt werden.');
 if(!db)throw new Error('Backend nicht eingerichtet');
 const {data,error}=await db.rpc('record_booking_payment',{
  p_request_id:requestId,p_booking_id:booking.id,p_amount_cents:amountCents,p_method:method,
  p_expected_paid_cents:paid,p_expected_total_cents:total
 });
 if(error)throw failure(error);
 if(!data||data.id!==requestId||data.booking_id!==booking.id||data.amount_cents!==amountCents||data.method!==method)
  throw new Error('Keine gültige Zahlungsbestätigung vom Server');
 return data as BookingPayment;
}
/** Non-snapshot paginated history preview. Never use it as an authoritative cash total. */
export async function loadBookingPayments(bookingId?:string):Promise<BookingPayment[]> {
 if(bookingId!==undefined)validId(bookingId);
 if(!db)throw new Error('Backend nicht eingerichtet');
 const result:BookingPayment[]=[];
 // Do not silently truncate the employee report at Supabase's default row limit.
 for(let offset=0;;offset+=1000){
  let query=db.from('booking_payments').select('*').order('occurred_at').order('id');
  if(bookingId!==undefined)query=query.eq('booking_id',bookingId);
  const {data,error}=await query.range(offset,offset+999);
  if(error)throw failure(error);
  if(!Array.isArray(data))throw new Error('Zahlungen konnten nicht geladen werden');
  result.push(...data as BookingPayment[]);
  if(data.length<1000)return result;
 }
}
export type EmployeeCashTotal={
 employeeId:string;employeeName:string;source:'ledger'|'legacy';cashCents:number;
};
export type EmployeeCashReport={
 totals:EmployeeCashTotal[];conflictBookingIds:string[];unparsedBookingIds:string[];
 /** Always null: separate client reads are not a consistent financial snapshot. */
 totalCents:null;
 previewTotalCents:number|null;
 snapshotConsistent:false;
 label:string;
};
/**
 * NON-SNAPSHOT PREVIEW ONLY. Both employee rows and previewTotalCents need a preview label.
 * Cash only. Legacy notes are a separate, explicitly historical identity namespace.
 * No provider, paid amount, driver assignment or booking price is treated as cash.
 */
export function employeeCashTotals(bookings:readonly Booking[],payments:readonly BookingPayment[]):EmployeeCashReport {
 const totals=new Map<string,EmployeeCashTotal>(),cashBookings=new Set<string>(),seenPayments=new Set<string>();
 const conflictBookingIds:string[]=[],unparsedBookingIds:string[]=[];
 const selected=new Set(bookings.map(b=>b.id));
 function add(id:string,name:string,source:'ledger'|'legacy',amount:number){
  const current=totals.get(id);
  if(current)current.cashCents+=amount;
  else totals.set(id,{employeeId:id,employeeName:name,source,cashCents:amount});
 }
 for(const payment of payments){
  if(seenPayments.has(payment.id)||!selected.has(payment.booking_id)||payment.method!=='cash')continue;
  seenPayments.add(payment.id);
  if(!Number.isSafeInteger(payment.amount_cents)||payment.amount_cents<=0)throw new Error('Ungültiger Zahlungsbeleg');
  cashBookings.add(payment.booking_id);
  add(payment.actor_id,payment.actor_name,'ledger',payment.amount_cents);
 }
 const seenBookings=new Set<string>();
 for(const b of bookings){
  if(seenBookings.has(b.id))continue;
  seenBookings.add(b.id);
  const raw=(b.key_cash??'').trim();
  if(!/[0-9]/.test(raw))continue;
  if(cashBookings.has(b.id)){conflictBookingIds.push(b.id);continue;}
  // Conservative legacy grammar: one nonnegative amount, optional €, then a name.
  const match=/^(\d+(?:[.,]\d{1,2})?)\s*€?\s*([^\d€]*)$/.exec(raw);
  if(!match){unparsedBookingIds.push(b.id);continue;}
  const amount=cents(Number(match[1].replace(',','.')));
  let name=match[2].trim().replace(/^ok/i,'').trim()||'Wael';
  if(name.toLowerCase()==='alaa')name='Alaa';
  if(name.toLowerCase()==='wael')name='Wael';
  add('legacy:'+name.toLowerCase(),name,'legacy',amount);
 }
 const list=[...totals.values()];
 const total=list.reduce((sum,row)=>sum+row.cashCents,0);
 if(!Number.isSafeInteger(total))throw new Error('Bargeldsumme ist zu groß');
 return {totals:list,conflictBookingIds,unparsedBookingIds,
  totalCents:null,previewTotalCents:conflictBookingIds.length||unparsedBookingIds.length?null:total,
  snapshotConsistent:false,label:'Vorschau, kein konsistenter Buchungs-/Zahlungsstand'};
}
