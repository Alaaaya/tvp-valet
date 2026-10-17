import type {FlightUpdate} from './flights';
export type LiveMap=Record<string,FlightUpdate>;
/** In-memory only. Merge a fetch for one date key d: fresh entries replace; requested flights absent from the response keep their previous same-date entry, marked stale with the timestamp of their last fresh fetch. */
export function mergeLive(prev:LiveMap,stale:Record<string,string>,d:string,requested:string[],fresh:FlightUpdate[],updatedAt:string){
  const live:LiveMap={};const st:Record<string,string>={};
  for(const [k,v] of Object.entries(prev)){const[kd]=k.split('|');if(kd!==d){live[k]=v;if(stale[k])st[k]=stale[k]}}
  for(const f of fresh)live[d+'|'+f.flightNumber]=f;
  for(const n of requested){const k=d+'|'+n;if(!live[k]&&prev[k]){live[k]=prev[k];st[k]=stale[k]||updatedAt}}
  return{live,stale:st};
}
/** Transient error: keep everything, mark same-date entries stale. */
export function markStale(prev:LiveMap,stale:Record<string,string>,d:string,at:string){
  const st={...stale};for(const k of Object.keys(prev))if(k.split('|')[0]===d&&!st[k])st[k]=at;return st;
}
