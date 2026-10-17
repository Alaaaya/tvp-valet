import {eventTime,day,utc as utcForDayInput,type Booking} from '../model';
import type {FlightUpdate} from './flights';
import {normalizeFlightNumber} from '../../supabase/functions/_shared/flights';
export const nextDay=(d:string)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+1);return x.toISOString().slice(0,10)};
export const delayText=(d:number|null)=>d?(d>0?'+':'−')+Math.abs(d)+'′':'';

export function liveForDate(live:Record<string,FlightUpdate>,b:Booking,enabled:boolean):FlightUpdate|undefined {
 if(!enabled||!b.flight_out)return undefined;
 try{return live[day(b.departure_at)+'|'+normalizeFlightNumber(b.flight_out)]}catch{return undefined}
}
export function resolveEventTime(b:Booking,kind:'in'|'out',enabled:boolean,live?:FlightUpdate):string {
 const recorded=kind==='in'?b.actual_flight_in:b.actual_flight_out;
 const checked=kind==='in'?b.checked_in_at:b.checked_out_at;
 if(checked||recorded||!enabled||kind==='in')return eventTime(b,kind,enabled);
 // Only DUS return arrivals have a live source. Never look up outbound flights here.
 return live?.actual||live?.estimated||live?.scheduled||eventTime(b,kind,enabled);
}
export function inDateWindow(time:string,date:string,before=0,after=0):boolean {
 const lo=Date.parse(utcForDay(date))-before*36e5,hi=Date.parse(utcForDay(nextDay(date)))+after*36e5;
 const t=Date.parse(time);return t>=lo&&t<hi;
}
const utcForDay=(d:string)=>utcForDayInput(d+'T00:00');
