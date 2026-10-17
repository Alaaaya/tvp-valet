import {db} from '../api';
import type {Booking} from '../model';

type EditBooking=Booking&{edit_revision?:number;lifecycle_revision?:number;detail_revision?:number};
export const bookingEditFields=['customer_name','first_name','last_name','car_description','phone','email','persons','plate','km','key_cash','comment','arrival_at','departure_at','flight_in','flight_out'] as const;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limits:Record<string,number>={customer_name:200,first_name:120,last_name:120,car_description:500,phone:64,email:254,plate:40,key_cash:200,comment:10000,flight_in:40,flight_out:40};
/** Preserve original snapshot and requestId for network retries. Never pass a freshly reloaded
 * original to silently overwrite a conflict. All non-whitelisted fields are excluded.
 */
export async function saveEditedBooking(original:Booking,edited:Booking,requestId:string):Promise<Booking>{
 const o=original as EditBooking;
 if(!uuid.test(requestId)||!uuid.test(o.id)||edited.id!==o.id)throw new Error('Ungültige Anfrage-ID');
 for(const r of [o.edit_revision,o.lifecycle_revision,o.detail_revision])
  if(r===undefined||!Number.isSafeInteger(r)||r<0)throw new Error('Ungültiger Buchungsstand. Bitte neu laden.');
 const patch:Record<string,unknown>={};
 for(const key of bookingEditFields){
  const v=edited[key],old=original[key];
  if(v===old||(v==null&&old==null))continue;
  if(v===undefined)throw new Error('Ungültiges Feld: '+key);
  if(key==='persons'){
   if(!Number.isInteger(v)||Number(v)<1||Number(v)>100)throw new Error('Personen: 1 bis 100');
  }else if(key==='km'){
   if(v!==null&&(!Number.isInteger(v)||Number(v)<0||Number(v)>2147483647))throw new Error('Kilometerstand ungültig');
  }else if(key==='arrival_at'||key==='departure_at'){
   if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))throw new Error('Ungültiger Zeitpunkt');
  }else{
   if(v!==null&&(typeof v!=='string'||v.length>limits[key]))throw new Error('Ungültiges Feld: '+key);
   if((key==='customer_name'||key==='plate')&&(typeof v!=='string'||!v.trim()))throw new Error('Name und Kennzeichen dürfen nicht leer sein');
  }
  patch[key]=v;
 }
 if(!Number.isFinite(Date.parse(edited.arrival_at))||!Number.isFinite(Date.parse(edited.departure_at))||Date.parse(edited.departure_at)<Date.parse(edited.arrival_at))throw new Error('Rückgabe muss nach der Annahme liegen');
 if(!Object.keys(patch).length)throw new Error('Keine Änderungen');
 if(!db)throw new Error('Backend nicht eingerichtet');
 const {data,error}=await db.rpc('apply_booking_safe_edit',{p_request_id:requestId,p_booking_id:o.id,p_patch:patch,p_expected:{
  edit_revision:o.edit_revision,lifecycle_revision:o.lifecycle_revision,detail_revision:o.detail_revision,
  status:o.status,checked_in_at:o.checked_in_at,checked_out_at:o.checked_out_at,spot:o.spot??''
 }});
 if(error){
  if(error.code==='PT409'||error.code==='40001')throw new Error('Die Buchung wurde inzwischen geändert. Bitte neu laden.');
  if(error.code==='42501')throw new Error('Keine Berechtigung für diese Änderung.');
  throw new Error(error.message||'Speichern fehlgeschlagen');
 }
 if(!data||data.id!==o.id||!Number.isSafeInteger(data.edit_revision)||data.edit_revision<0)throw new Error('Keine Bestätigung vom Server');
 return {...data,...Object.fromEntries(['external_id','phone','email','plate','product','flight_in','flight_out','key_cash','spot','comment'].map(k=>[k,data[k]??''])),lifecycle_revision:o.lifecycle_revision} as EditBooking;
}
