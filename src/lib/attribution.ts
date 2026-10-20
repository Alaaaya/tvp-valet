import {db} from '../api';

/** Who did which step of a booking. Values are display names. */
export type AttributionKey='in'|'out'|'taken_away'|'retrieved'|'call_in'|'call_out';
export type Attribution=Partial<Record<AttributionKey,string>>;
export interface HandoverActor{action:'in'|'out';performed_by:string;completed_at:string}
export interface OperationActor{action:string;actor_id:string;occurred_at:string}
export interface CallActor{occurred_at:string;actor_id:string|null;actor_name:string|null}
export interface AttributionInput{
  booking:{checked_in_at:string|null;checked_out_at:string|null};
  ops?:{taken_away_at:string|null;retrieved_at:string|null;customer_called_at:string|null}|null;
  handovers?:HandoverActor[]|null;
  events?:OperationActor[]|null;
  calls?:CallActor[]|null;
  names:Record<string,string>;
}
const ms=(v:string|null|undefined)=>v?Date.parse(v):NaN;
function latest<T>(rows:T[],at:(r:T)=>string):T|undefined{let best:T|undefined;for(const r of rows)if(!best||ms(at(r))>=ms(at(best)))best=r;return best}

/** Pure mapping from stored actor ids to names, only for steps that are currently done. */
export function deriveAttribution(i:AttributionInput):Attribution{
  const out:Attribution={},name=(id:string|null|undefined)=>id?i.names[id]:undefined;
  for(const k of ['in','out'] as const){
    if(!(k==='in'?i.booking.checked_in_at:i.booking.checked_out_at))continue;
    const h=latest((i.handovers||[]).filter(r=>r.action===k),r=>r.completed_at),n=name(h?.performed_by);if(n)out[k]=n;
  }
  for(const k of ['taken_away','retrieved'] as const){
    const at=i.ops?.[k==='taken_away'?'taken_away_at':'retrieved_at'];if(!at)continue;
    const evs=(i.events||[]).filter(e=>e.action===k),exact=evs.find(e=>ms(e.occurred_at)===ms(at)),e=exact||latest(evs,r=>r.occurred_at),n=name(e?.actor_id);if(n)out[k]=n;
  }
  const cAt=i.ops?.customer_called_at;
  if(cAt){
    const calls=i.calls||[],exact=calls.find(c=>ms(c.occurred_at)===ms(cAt)),c=exact||latest(calls,r=>r.occurred_at);
    const n=c?(c.actor_name||name(c.actor_id)):undefined,ci=ms(i.booking.checked_in_at);
    if(n)out[!isNaN(ci)&&ms(cAt)>=ci?'call_out':'call_in']=n;
  }
  return out;
}

/** Loads stored actors for one booking. Every source is optional; a failed source just shows no name. */
export async function loadAttributionSources(bookingId:string):Promise<Omit<AttributionInput,'booking'|'ops'>>{
  if(!db)return {names:{}};
  const [h,e,c]=await Promise.allSettled([
    db.from('booking_handovers').select('action,performed_by,completed_at').eq('booking_id',bookingId),
    db.from('booking_operation_events').select('action,actor_id,occurred_at').eq('booking_id',bookingId).in('action',['taken_away','retrieved']),
    db.rpc('booking_call_history',{p_booking_id:bookingId}),
  ]);
  const ok=<T,>(r:PromiseSettledResult<{data:unknown;error:unknown}>):T[]|null=>r.status==='fulfilled'&&!r.value.error&&Array.isArray(r.value.data)?r.value.data as T[]:null;
  const handovers=ok<HandoverActor>(h),events=ok<OperationActor>(e),calls=ok<CallActor>(c);
  const ids=[...new Set([...(handovers||[]).map(x=>x.performed_by),...(events||[]).map(x=>x.actor_id)].filter(Boolean))];
  const names:Record<string,string>={};
  if(ids.length){const r=await db.from('profiles').select('id,full_name').in('id',ids);if(!r.error)for(const p of (r.data||[]) as {id:string;full_name:string}[])names[p.id]=p.full_name}
  return {handovers,events,calls,names};
}
