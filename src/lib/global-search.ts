import type {Booking} from '../model';
export const normalizePlate=(s:string)=>s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9äöüß]/g,'');
export const normalizeText=(s:string)=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export type SearchHit=Pick<Booking,'id'|'plate'|'code'|'customer_name'|'arrival_at'|'departure_at'|'status'>&Partial<Booking>;
export function matchesBooking(b:SearchHit,q:string):boolean{
 const t=normalizeText(q);if(!t)return false;
 const p=normalizePlate(q);
 if(p&&normalizePlate(b.plate||'').includes(p))return true;
 if(normalizeText(b.customer_name||'').includes(t))return true;
 return normalizeText(b.code||'').includes(t)||normalizeText(b.external_id||'').includes(t);
}
// Nearest upcoming first (ascending), then nearest past (descending). Reference time = arrival_at.
export function sortGlobal<T extends SearchHit>(rows:T[],now=Date.now()):T[]{
 const at=(b:T)=>Date.parse(b.arrival_at);
 const up=rows.filter(b=>at(b)>=now).sort((a,b)=>at(a)-at(b)||a.id.localeCompare(b.id));
 const past=rows.filter(b=>!(at(b)>=now)).sort((a,b)=>at(b)-at(a)||a.id.localeCompare(b.id));
 return [...up,...past];
}
export function searchLocal<T extends SearchHit>(rows:T[],q:string,now=Date.now()):T[]{return sortGlobal(rows.filter(b=>matchesBooking(b,q)),now)}
export type PageFetcher<T>=(from:number,to:number,signal:AbortSignal)=>Promise<T[]>;
// Fetch every page in deterministic order (caller orders by arrival_at,id). Throws AbortError if aborted.
export async function fetchAllPages<T>(fetchPage:PageFetcher<T>,signal:AbortSignal,size=500,max=200):Promise<T[]>{
 const out:T[]=[];
 for(let i=0;i<max;i++){
  if(signal.aborted)throw new DOMException('aborted','AbortError');
  const page=await fetchPage(i*size,i*size+size-1,signal);
  if(signal.aborted)throw new DOMException('aborted','AbortError');
  out.push(...page);if(page.length<size)return out;
 }
 throw new Error('too many pages');
}
// Race-safe debounced runner: only the latest query result is delivered; scope change aborts.
export function createGlobalSearch<T extends SearchHit>(o:{load:(signal:AbortSignal)=>Promise<T[]>;onResult:(r:{query:string;rows:T[]}|{query:string;error:unknown}|null)=>void;delay?:number;now?:()=>number}){
 let timer:ReturnType<typeof setTimeout>|undefined,ctl:AbortController|undefined,seq=0,cache:T[]|null=null;
 const cancel=()=>{clearTimeout(timer);ctl?.abort();ctl=undefined;seq++};
 return{
  set(query:string){cancel();if(!normalizeText(query)){o.onResult(null);return}
   const my=seq;timer=setTimeout(async()=>{const c=ctl=new AbortController();try{cache??=await o.load(c.signal);if(my!==seq||c.signal.aborted)return;o.onResult({query,rows:searchLocal(cache,query,(o.now??Date.now)())})}catch(error){if(my!==seq||c.signal.aborted)return;o.onResult({query,error})}},o.delay??250)},
  reset(){cancel();cache=null;o.onResult(null)}, // call on account switch
  dispose(){cancel();cache=null}
 };
}
