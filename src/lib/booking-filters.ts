import {type Booking} from '../model';
import {inDateWindow,resolveEventTime} from './flightview';
import type {FlightUpdate} from './flights';
export const SERVICE_TYPES=['Shuttle','Valet','Terminal','Cruise','Valet/Shuttle','Shuttle/Valet'] as const;
export type ServiceType=typeof SERVICE_TYPES[number];
export type MainBookingFilters={done:boolean;cancelled:boolean;noshow:boolean;assigned:boolean;flights:boolean;flInOn:boolean;flOutOn:boolean;before:number;after:number;type:'all'|'in'|'out';products:string[];placements:string[];services:ServiceType[];platform:string};
export type BookingEvent={b:Booking;kind:'in'|'out';time:string;completed:boolean};
export const defaultMainFilters=():MainBookingFilters=>({done:false,cancelled:false,noshow:false,assigned:false,flights:true,flInOn:false,flOutOn:true,before:0,after:0,type:'all',products:[],placements:[],services:[],platform:''});
const hours=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)?Math.min(24,Math.max(0,x)):0;
const strings=(x:unknown)=>Array.isArray(x)?[...new Set(x.filter((s):s is string=>typeof s==='string'))]:[];
export function normalizeMainFilters(input:unknown):MainBookingFilters{
 const d=defaultMainFilters();if(!input||typeof input!=='object')return d;const x=input as Record<string,unknown>;
 for(const k of ['done','cancelled','noshow','assigned','flights','flInOn','flOutOn'] as const)if(typeof x[k]==='boolean')d[k]=x[k];
 return {...d,before:hours(x.before),after:hours(x.after),type:x.type==='in'||x.type==='out'?x.type:'all',products:strings(x.products),placements:strings(x.placements).filter(s=>s==='covered'||s==='open'),services:strings(x.services).filter((s):s is ServiceType=>SERVICE_TYPES.includes(s as ServiceType)),platform:typeof x.platform==='string'?x.platform:''};
}
export const mainFiltersKey=(userId:string)=>'tvp.main-booking-filters.v1.'+encodeURIComponent(userId);
type Reader=Pick<Storage,'getItem'>;type Writer=Pick<Storage,'setItem'>;
export function readMainFilters(storage:Reader,userId:string):MainBookingFilters{if(!userId)return defaultMainFilters();try{return normalizeMainFilters(JSON.parse(storage.getItem(mainFiltersKey(userId))||'null'))}catch{return defaultMainFilters()}}
export function writeMainFilters(storage:Writer,userId:string,value:MainBookingFilters):void{if(!userId)return;try{storage.setItem(mainFiltersKey(userId),JSON.stringify(normalizeMainFilters(value)))}catch{/* Private mode/quota must not interrupt bookings or auth. */}}
/** Product -V- is an imported explicit valet code; unknown products stay unknown. */
export function bookingService(b:Booking):ServiceType|null{return /(?:^|-)V(?:-|$)/i.test(b.product)?'Valet':null}
export function sameMinuteNoShow(b:Booking):boolean{return !!b.checked_in_at&&!!b.checked_out_at&&Number.isFinite(Date.parse(b.checked_in_at))&&Math.floor(Date.parse(b.checked_in_at)/60000)===Math.floor(Date.parse(b.checked_out_at)/60000)}
export function mainBookingEvents(rows:readonly Booking[],date:string,input:MainBookingFilters,userId:string,query='',liveFor?:(b:Booking)=>FlightUpdate|undefined):BookingEvent[]{
 const f=normalizeMainFilters(input),result:BookingEvent[]=[],seen=new Set<string>(),q=query.trim().toLocaleLowerCase('de-DE');
 // Invalid/partial date input is an empty selection, never an exception in rendering.
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)return result;
 for(const b of rows){
  if(seen.has(b.id))continue;seen.add(b.id);
  const noShow=b.status==='no_show'||sameMinuteNoShow(b);
  if(noShow?!f.noshow:b.status==='cancelled'?!f.cancelled:b.status!=='confirmed')continue;
  if(f.assigned&&(!userId||b.driver_id!==userId))continue;
  if(f.products.length&&!f.products.includes(b.product))continue;
  if(f.placements.length&&!f.placements.includes(b.covered?'covered':'open'))continue;
  if(f.services.length&&!f.services.includes(bookingService(b) as ServiceType))continue;
  if(f.platform&&b.platform!==f.platform)continue;
  if(q&&![b.plate,b.code,b.customer_name,b.external_id].join(' ').toLocaleLowerCase('de-DE').includes(q))continue;
  for(const kind of ['in','out'] as const){
   if(f.type!=='all'&&f.type!==kind)continue;
   const completed=!!(kind==='in'?b.checked_in_at:b.checked_out_at);
   // Explicit exceptional-status switches should reveal those records even if their legacy timestamps are filled.
   if(completed&&!f.done&&!noShow&&b.status==='confirmed')continue;
   const enabled=f.flights&&(kind==='in'?f.flInOn:f.flOutOn);
   const time=resolveEventTime(b,kind,enabled,kind==='out'&&enabled?liveFor?.(b):undefined);
   if(inDateWindow(time,date,f.before,f.after))result.push({b,kind,time,completed});
  }
 }
 return result.sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)||a.b.id.localeCompare(b.b.id)||a.kind.localeCompare(b.kind));
}
