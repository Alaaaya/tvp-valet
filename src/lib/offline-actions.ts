import {t as tr} from './i18n';
import {saveBooking,assignBookingDriver,db} from '../api';
import {driverField,type Booking} from '../model';
import {bookingEditFields} from './booking-safe-edit';
import {hasLegacyCashConflict,type PaymentInput} from './booking-payments';
import {createPendingMedia,mediaPath,validateHandover,type HandoverSave} from './handover-api';
import {canUndoHandover,undoHandover} from './handover-undo';
import {recordBookingOperation} from './operations';
import type {CustomerCallBooking,CustomerCallReceipt} from './customer-calls';
import type {BookingOperations,BookingOperationAction} from './operations';
import {routeWrite,durableBookingReady,isOnline,offlineWritesDisabledError} from './offline-capability';
import {saveEditedBooking} from './booking-safe-edit';
import {recordBookingPayment} from './booking-payments';
import {changeBookingSpot,transitionBookingStatus} from './booking-actions';
import {recordCustomerCall,clearCustomerCall} from './customer-calls';
import {saveHandover,validateMedia} from './handover-api';
import {enqueueOffline,cachedOfflineBooking,cachedOfflineOperations} from './offline-client';
type EditBooking=Booking;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limits:Record<string,number>={customer_name:200,first_name:120,last_name:120,car_description:500,phone:64,email:254,plate:40,key_cash:200,comment:10000,flight_in:40,flight_out:40};
const maxCents=999999999999;
function validId(id:string){if(!uuid.test(id))throw new Error(tr("Ungültige Anfrage-ID"));}
function cents(value:number):number {
 if(!Number.isFinite(value)||value<0)throw new Error(tr("Ungültiger Geldbetrag"));
 const decimal=value.toFixed(2);
 const [whole,fraction]=decimal.split('.');
 const rounded=Number(whole)*100+Number(fraction);
 if(Number(decimal)!==value||!Number.isSafeInteger(rounded)||rounded>maxCents)
  throw new Error(tr("Geldbeträge benötigen volle Cent"));
 return rounded;
}

function check(booking:Booking,id:string){
 validId(booking.id);validId(id);
 if(!Number.isSafeInteger(booking.sync_version)||(booking.sync_version??-1)<0)
  throw Error(tr("Offline-Speicherung für diese Buchung noch nicht verfügbar. Bitte online neu laden."));
}
function expected(b:Booking){return {edit_revision:b.edit_revision,lifecycle_revision:b.lifecycle_revision,detail_revision:b.detail_revision,status:b.status,checked_in_at:b.checked_in_at,checked_out_at:b.checked_out_at,spot:b.spot??''}}
async function queue(booking:Booking,id:string,kind:string,payload:Record<string,unknown>,projected:Booking,projectedOps?:BookingOperations,blobs?:Record<string,Blob>){
 check(booking,id);
 return enqueueOffline({id,booking,kind,payload,projected:{...projected,offline_pending:true},projectedOps,blobs});
}
async function durableEdit(original:Booking,edited:Booking,requestId:string):Promise<Booking>{
 const o=original as EditBooking;
 if(!uuid.test(requestId)||!uuid.test(o.id)||edited.id!==o.id)throw new Error(tr("Ungültige Anfrage-ID"));
 for(const r of [o.edit_revision,o.lifecycle_revision,o.detail_revision])
  if(r===undefined||!Number.isSafeInteger(r)||r<0)throw new Error(tr("Ungültiger Buchungsstand. Bitte neu laden."));
 const patch:Record<string,unknown>={};
 for(const key of bookingEditFields){
  const v=edited[key],old=original[key];
  if(v===old||(v==null&&old==null))continue;
  if(v===undefined)throw new Error(tr("Ungültiges Feld: ")+key);
  if(key==='persons'){
   if(!Number.isInteger(v)||Number(v)<1||Number(v)>100)throw new Error(tr("Personen: 1 bis 100"));
  }else if(key==='km'){
   if(v!==null&&(!Number.isInteger(v)||Number(v)<0||Number(v)>2147483647))throw new Error(tr("Kilometerstand ungültig"));
  }else if(key==='arrival_at'||key==='departure_at'){
   if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))throw new Error(tr("Ungültiger Zeitpunkt"));
  }else{
   if(v!==null&&(typeof v!=='string'||v.length>limits[key]))throw new Error(tr("Ungültiges Feld: ")+key);
   if((key==='customer_name'||key==='plate')&&(typeof v!=='string'||!v.trim()))throw new Error(tr("Name und Kennzeichen dürfen nicht leer sein"));
  }
  patch[key]=v;
 }
 if(!Number.isFinite(Date.parse(edited.arrival_at))||!Number.isFinite(Date.parse(edited.departure_at))||Date.parse(edited.departure_at)<Date.parse(edited.arrival_at))throw new Error(tr("Rückgabe muss nach der Annahme liegen"));
 if(!Object.keys(patch).length)throw new Error(tr("Keine Änderungen"));

 return (await queue(original,requestId,'safe_edit',{patch,expected:expected(original)},{...original,...patch,edit_revision:original.edit_revision!+1})).booking;
}
type DetailInput={booking:Booking;requestId:string};
function detailStand(b:Booking){for(const r of [b.lifecycle_revision,b.detail_revision])if(!Number.isSafeInteger(r)||(r??-1)<0)throw Error(tr("Ungültiger Buchungsstand. Bitte neu laden."))}
async function durableSpot({booking,requestId,spot}:DetailInput&{spot:string}):Promise<Booking>{
 detailStand(booking);spot=spot.trim();
 if(!spot||spot.length>100)throw Error(tr("Bitte einen Stellplatz mit 1 bis 100 Zeichen angeben."));
 if(booking.status!=='confirmed'||booking.checked_out_at)throw Error(tr("Standortänderung nur für offene bestätigte Buchungen."));
 if(spot===(booking.spot??''))throw Error(tr("Der Stellplatz ist unverändert."));
 const {edit_revision:_,...exp}=expected(booking);
 return (await queue(booking,requestId,'detail',{action:'spot',target:spot,expected:exp},{...booking,spot,detail_revision:booking.detail_revision!+1})).booking;
}
async function durableStatus({booking,requestId,status}:DetailInput&{status:'no_show'|'cancelled'}):Promise<Booking>{
 detailStand(booking);
 if(!['no_show','cancelled'].includes(status))throw Error(tr("Ungültiger Status"));
 if(booking.checked_in_at||booking.checked_out_at)throw Error(tr("Bitte zuerst Check-out und Check-in ausdrücklich rückgängig machen."));
 if(booking.status!=='confirmed')throw Error(tr("Die Buchung ist nicht bestätigt."));
 const {edit_revision:_,...exp}=expected(booking);
 return (await queue(booking,requestId,'detail',{action:'status',target:status,expected:exp},{...booking,status,detail_revision:booking.detail_revision!+1})).booking;
}
async function durablePayment({booking,requestId,amountCents,method}:PaymentInput):Promise<Booking>{
 validId(requestId);validId(booking.id);
 if(!['cash','card','bank_transfer'].includes(method))throw new Error(tr("Ungültige Zahlungsart"));
 if(!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>maxCents)throw new Error(tr("Bitte einen positiven Betrag in Cent angeben"));
 const paid=cents(booking.paid),total=cents(booking.total);
 if(amountCents>total-paid)throw new Error(tr("Der Betrag übersteigt den offenen Restbetrag"));
 if(booking.status!=='confirmed')throw new Error(tr("Die Buchung ist nicht bestätigt"));
 if(method==='cash'&&hasLegacyCashConflict(booking))throw new Error(tr("Vorhandener Bargeld-/Schlüsselvermerk muss vor einer Barzahlung geklärt werden."));

 return (await queue(booking,requestId,'payment',{amount_cents:amountCents,method,expected_paid_cents:paid,expected_total_cents:total},{...booking,paid:(paid+amountCents)/100})).booking;
}
type CallInput={booking:CustomerCallBooking;requestId:string;allowRepeat?:boolean};
async function call({booking,requestId,allowRepeat=false}:CallInput,clear:boolean):Promise<CustomerCallReceipt>{
 if(booking.customer_called_at===undefined||!Number.isSafeInteger(booking.lifecycle_revision)||(booking.lifecycle_revision??-1)<0)throw Error(tr("Ungültiger Buchungsstand. Bitte neu laden."));
 if(booking.status!=='confirmed'||booking.checked_out_at!==null)throw Error(tr("Anruf nur für offene bestätigte Buchungen."));
 if(clear&&(!booking.customer_called_at||!Number.isFinite(Date.parse(booking.customer_called_at))))throw Error(tr("Kein Anruf zum Löschen vorhanden."));
 if(!clear&&booking.customer_called_at&&!allowRepeat)throw Error(tr("Erneuten Anruf bitte ausdrücklich bestätigen."));
 const now=new Date().toISOString(),called=clear?null:now;
 const payload:Record<string,unknown>={expected_called_at:booking.customer_called_at,expected_lifecycle_revision:booking.lifecycle_revision};
 if(!clear)Object.assign(payload,{expected_checked_out_at:booking.checked_out_at,allow_repeat:allowRepeat});
 const old=cachedOfflineOperations(booking.id);
 const ops:BookingOperations={booking_id:booking.id,taken_away_at:null,retrieved_at:null,ride_started_at:null,performed_by:'',...old,customer_called_at:called,updated_at:now};
 await queue(booking,requestId,clear?'clear_customer_call':'customer_call',payload,{...booking,customer_called_at:called} as Booking,ops);
 return {receipt_id:requestId,occurred_at:now,customer_called_at:called,lifecycle_revision:booking.lifecycle_revision!,offline_pending:true};
}
export const offlineRecordCustomerCall=(input:CallInput)=>routeWrite(input.booking,()=>call(input,false),()=>recordCustomerCall(input));
export const offlineClearCustomerCall=(input:CallInput)=>routeWrite(input.booking,()=>call(input,true),()=>clearCustomerCall(input));
async function durableHandover({booking,requestId,action,details,media}:HandoverSave):Promise<Booking>{
 if(!['in','out'].includes(action))throw Error(tr("Ungültige Übergabe."));
 validateHandover(details,media);
 if(booking.status!=='confirmed'||(action==='in'?(!!booking.checked_in_at||!!booking.checked_out_at):(!booking.checked_in_at||!!booking.checked_out_at)))throw Error(tr("Ungültige Übergabe."));
 if(!Number.isSafeInteger(booking.lifecycle_revision)||(booking.lifecycle_revision??-1)<0)throw Error(tr("Ungültiger Buchungsstand. Bitte neu laden."));
 const blobs:Record<string,Blob>={};
 const metadata=media.map(item=>{const path=mediaPath(booking.id,requestId,item);blobs[item.id]=item.blob;return{id:item.id,path,kind:item.kind,mime_type:item.mime_type,captured_at:item.captured_at,size_bytes:item.blob.size}});
 const projected={...booking,km:details.km,key_cash:details.key_cash,[action==='in'?'flight_in':'flight_out']:details.flight_number,comment:details.comment.trim()?[booking.comment,details.comment].filter(Boolean).join('\n'):booking.comment,[action==='in'?'checked_in_at':'checked_out_at']:new Date().toISOString()};
 projected.edit_revision=(booking.edit_revision??0)+(bookingEditFields.some(k=>projected[k]!==booking[k])?1:0);
 return (await queue(booking,requestId,'handover',{action,details,media:metadata,expected_in:booking.checked_in_at,expected_out:booking.checked_out_at,expected_revision:booking.lifecycle_revision},projected,undefined,blobs)).booking;
}
async function durableUndo({booking,requestId,action}:{booking:Booking;requestId:string;action:'in'|'out'}):Promise<Booking>{
 if(!['in','out'].includes(action)||!canUndoHandover(booking,action))throw Error(tr("Diese Übergabe kann nicht rückgängig gemacht werden."));
 const old=cachedOfflineOperations(booking.id);
 const ops=action==='in'&&old?{...old,taken_away_at:null,retrieved_at:null,customer_called_at:null,ride_started_at:null}:undefined;
 return (await queue(booking,requestId,'undo_handover',{action,expected_at:action==='in'?booking.checked_in_at:booking.checked_out_at},{...booking,[action==='in'?'checked_in_at':'checked_out_at']:null,lifecycle_revision:(booking.lifecycle_revision??0)+1},ops)).booking;
}
async function durableOperation(bookingId:string,action:BookingOperationAction):Promise<BookingOperations>{
 const booking=cachedOfflineBooking(bookingId);
 if(!booking)throw Error(tr("Buchung nicht im Offline-Speicher."));
 if(!['taken_away','retrieved','ride_started'].includes(action))throw Error(tr("Ungültige Aktion."));
 if(booking.status!=='confirmed'||!booking.checked_in_at||booking.checked_out_at)throw Error(tr("Ungültige Aktion."));
 const now=new Date().toISOString(),old=cachedOfflineOperations(bookingId);
 const projected:BookingOperations={booking_id:bookingId,taken_away_at:null,retrieved_at:null,customer_called_at:null,ride_started_at:null,performed_by:'',updated_at:now,...old};
 const key=(action+'_at') as 'taken_away_at'|'retrieved_at'|'ride_started_at';
 if(!projected[key])projected[key]=now;
 const result=await queue(booking,crypto.randomUUID(),'operation',{action},booking,projected);
 return result.operations??projected;
}
async function durableBooking(b:Booking,admin:boolean):Promise<void>{
 const original=cachedOfflineBooking(b.id);
 if(!original){
  if(typeof navigator!=='undefined'&&navigator.onLine===false)throw Error(tr("Neue Buchungen benötigen eine Internetverbindung."));
  await saveBooking(b,admin);return;
 }
 // Existing callers here only save operational fields. Full identity edits use safe_edit.
 const patch={key_cash:b.key_cash,spot:b.spot,km:b.km,comment:b.comment,driver_id:b.driver_id};
 if(patch.km!==null&&(!Number.isInteger(patch.km)||patch.km<0||patch.km>2147483647))throw Error(tr("Kilometerstand ungültig"));
 if(typeof patch.key_cash!=='string'||patch.key_cash.length>200||typeof patch.spot!=='string'||patch.spot.length>100||typeof patch.comment!=='string'||patch.comment.length>10000)throw Error(tr("Ein Eingabefeld ist zu lang."));
 const changedEdit=bookingEditFields.some(k=>k in patch&&patch[k as keyof typeof patch]!==original[k]);
 const changedSpot=patch.spot!==original.spot;
 await queue(original,crypto.randomUUID(),'update_ops',{patch},{...original,...patch,edit_revision:(original.edit_revision??0)+(changedEdit?1:0),detail_revision:(original.detail_revision??0)+(changedSpot?1:0)});
}

/** Stage gallery evidence durably; the sync runtime uploads only after enqueue succeeds. */
async function durablePhoto(booking:Booking,file:Blob):Promise<Booking>{
 const item=createPendingMedia(file,'photo'),requestId=crypto.randomUUID();
 const path=mediaPath(booking.id,requestId,item);
 const metadata={id:item.id,path,kind:item.kind,mime_type:item.mime_type,captured_at:item.captured_at,size_bytes:item.blob.size};
 return (await queue(booking,requestId,'media_append',{media:[metadata]},booking,undefined,{[item.id]:item.blob})).booking;
}

export const saveOfflineEdit=(original:Booking,edited:Booking,requestId:string):Promise<Booking>=>
 routeWrite(original,()=>durableEdit(original,edited,requestId),()=>saveEditedBooking(original,edited,requestId));
export const offlineChangeSpot=(i:DetailInput&{spot:string}):Promise<Booking>=>routeWrite(i.booking,()=>durableSpot(i),()=>changeBookingSpot(i) as Promise<Booking>);
export const offlineTransitionStatus=(i:DetailInput&{status:'no_show'|'cancelled'}):Promise<Booking>=>routeWrite(i.booking,()=>durableStatus(i),()=>transitionBookingStatus(i) as Promise<Booking>);
export const offlineRecordPayment=(i:PaymentInput):Promise<Booking>=>routeWrite(i.booking,()=>durablePayment(i),async()=>{
 await recordBookingPayment(i);
 return {...i.booking,paid:(cents(i.booking.paid)+i.amountCents)/100};
});
export const saveOfflineHandover=(i:HandoverSave):Promise<Booking>=>routeWrite(i.booking,()=>durableHandover(i),()=>saveHandover(i));
export const offlineUndoHandover=(i:{booking:Booking;requestId:string;action:'in'|'out'}):Promise<Booking>=>routeWrite(i.booking,()=>durableUndo(i),()=>undoHandover(i));
export const offlineRecordOperation=(bookingId:string,action:BookingOperationAction):Promise<BookingOperations>=>
 routeWrite(cachedOfflineBooking(bookingId),()=>durableOperation(bookingId,action),()=>recordBookingOperation(bookingId,action));
export async function saveOfflineBooking(b:Booking,admin:boolean):Promise<void>{
 const original=cachedOfflineBooking(b.id);
 if(durableBookingReady(original))return durableBooking(b,admin);
 if(!isOnline())throw offlineWritesDisabledError();
 await saveBooking(b,admin);
}
/** Driver assignment from the detail picker: durable update_ops with only driver_id, else the online RPC. */
export const offlineAssignDriver=(booking:Booking,driverId:string|null,side:'in'|'out'='in'):Promise<void>=>{
 const original=cachedOfflineBooking(booking.id),field=driverField(side);
 return routeWrite(original,async()=>{await queue(original!,crypto.randomUUID(),'update_ops',{patch:{[field]:driverId}},{...original!,[field]:driverId})},()=>assignBookingDriver(booking.id,driverId,side));
};
export const offlineAppendPhoto=(booking:Booking,file:Blob):Promise<Booking>=>routeWrite(booking,()=>durablePhoto(booking,file),async()=>{
 if(!db)throw Error(tr('Backend nicht eingerichtet'));
 const mime=validateMedia(file,'photo'),ext=mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg';
 const {error}=await db.storage.from('booking-media').upload(booking.id+'/'+crypto.randomUUID()+'.'+ext,file,{contentType:mime});
 if(error)throw error;return booking;
});
