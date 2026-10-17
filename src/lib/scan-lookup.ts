import type {Booking} from '../model';
import {normalizePlate} from './booking-scan-parse';
export interface ScanQuery{kind:'qr'|'plate';value:string}
export type ScanOutcome=
 |{status:'single';booking:Booking}
 |{status:'ambiguous';bookings:Booking[]}
 |{status:'outside';bookings:Booking[];jumpDate:string|null;filteredAfterJump?:boolean;blocking?:string[]}
 |{status:'unknown'};
const norm=(s:string)=>(s||'').trim().toUpperCase().replace(/^#/,'');
export function matchesScan(b:Booking,q:ScanQuery):boolean{
 if(q.kind==='plate'){const k=normalizePlate(q.value);return k.length>=2&&normalizePlate(b.plate)===k}
 const v=norm(q.value);return v.length>=3&&(norm(b.code)===v||(!!b.external_id&&norm(b.external_id)===v))
}
/** Matches within the currently visible population; otherwise any matching row elsewhere (never changes filters/date itself). */
export function resolveScan(q:ScanQuery,visible:readonly Booking[],all:readonly Booking[],dayOf:(b:Booking)=>string|null=()=>null):ScanOutcome{
 const uniq=(l:readonly Booking[])=>[...new Map(l.filter(b=>matchesScan(b,q)).map(b=>[b.id,b])).values()];
 const v=uniq(visible);
 if(v.length===1)return{status:'single',booking:v[0]};
 if(v.length>1)return{status:'ambiguous',bookings:v};
 const o=uniq(all);
 if(!o.length)return{status:'unknown'};
 return{status:'outside',bookings:o,jumpDate:o.length===1?dayOf(o[0]):null};
}

/** After an explicit date jump, hidden matches still require the user's own filter choice. */
export function scanAfterJump(booking:Booking,visible:readonly Booking[],blocking:string[]=[]):ScanOutcome|null{
 return visible.some(b=>b.id===booking.id)?null:{status:'outside',bookings:[booking],jumpDate:null,filteredAfterJump:true,blocking};
}
