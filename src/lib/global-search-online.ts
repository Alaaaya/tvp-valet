import {db} from '../api';
import type {Booking} from '../model';
import {fetchAllPages} from './global-search';
const TEXT=['external_id','phone','email','plate','product','flight_in','flight_out','key_cash','spot','comment'];
/** Every booking visible to the signed-in account (RLS), in deterministic arrival_at,id order, all pages. */
export async function loadAllBookingsOnline(signal:AbortSignal,client:any=db):Promise<Booking[]>{
 if(!client)throw new Error('Backend nicht eingerichtet');
 const rows=await fetchAllPages<any>(async(from,to,sig)=>{
  const {data,error}=await client.from('bookings').select('*').order('arrival_at').order('id').range(from,to).abortSignal(sig);
  if(error)throw error;return data||[];
 },signal,500);
 // pagination under concurrent writes may repeat rows: dedupe by id
 const seen=new Map<string,any>();for(const r of rows)seen.set(r.id,r);
 return [...seen.values()].map(x=>({...x,...Object.fromEntries(TEXT.map(k=>[k,x[k]??'']))})) as Booking[];
}
