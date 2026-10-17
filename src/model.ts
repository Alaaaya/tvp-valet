import {formatInTimeZone,fromZonedTime} from 'date-fns-tz';
export const TZ='Europe/Berlin';
export const day=(v:string|Date=new Date())=>formatInTimeZone(v,TZ,'yyyy-MM-dd');
export const clock=(v:string)=>formatInTimeZone(v,TZ,'HH:mm');
export const stamp=(v:string)=>formatInTimeZone(v,TZ,'dd.MM.yyyy HH:mm');
export const localInput=(v:string)=>formatInTimeZone(v,TZ,"yyyy-MM-dd'T'HH:mm");
export const utc=(v:string)=>fromZonedTime(v,TZ).toISOString();
export const money=(n:number)=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n);
export type Booking={lifecycle_revision?:number;detail_revision?:number;id:string;code:string;external_id:string;platform:string;customer_name:string;first_name?:string|null;last_name?:string|null;car_description?:string|null;phone:string;email:string;persons:number;plate:string;product:string;covered:boolean;arrival_at:string;departure_at:string;flight_in:string;flight_out:string;actual_flight_in:string|null;actual_flight_out:string|null;checked_in_at:string|null;checked_out_at:string|null;status:'confirmed'|'cancelled'|'no_show';total:number;paid:number;key_cash:string;spot:string;km:number|null;comment:string;driver_id:string|null;created_at:string};
export type Employee={id:string;full_name:string;role:'admin'|'driver';email?:string};
export const tariff=(days:number,covered:boolean)=>40+Math.max(0,Math.ceil(days)-1)*10+(covered?10:0);
export function cashTotals(rows:Booking[]){const totals:Record<string,number>={};for(const b of rows){const m=b.key_cash.match(/(\d+(?:[.,]\d+)?)\s*€?\s*(.*)/);if(m){let name=m[2].trim().replace(/^ok/i,'').trim();if(!name)name='Wael';if(name.toLowerCase()==='alaa')name='Alaa';totals[name]=(totals[name]||0)+Number(m[1].replace(',','.'));}}return totals}
export function blank():Booking{const d=day();return{id:crypto.randomUUID(),code:'TVP-'+crypto.randomUUID().slice(0,6).toUpperCase(),external_id:'',platform:'Website',customer_name:'',phone:'',email:'',persons:1,plate:'',product:'VALET-F',covered:false,arrival_at:utc(d+'T10:00'),departure_at:utc(d+'T18:00'),flight_in:'',flight_out:'',actual_flight_in:null,actual_flight_out:null,checked_in_at:null,checked_out_at:null,status:'confirmed',total:40,paid:0,key_cash:'',spot:'',km:null,comment:'',driver_id:null,created_at:new Date().toISOString()}}
export function demoSeed():Booking[]{const names=['Fabio Gianfelici','Samantha Saris','Miriam Becker','Jonas Schneider','Nadia Hassan','Lukas Weber','Anna de Vries','Thomas Fischer'];return names.map((name,i)=>({...blank(),customer_name:name,plate:['D-TV 240','MH-AN 72','K-LS 901','DU-JS 42','E-NH 880','NE-LW 55','NL-483-X','ME-TF 19'][i],code:'DEMO-'+(i+101),external_id:'DEMO-2026-'+i,platform:['Flughafenstellplatz','AvioGo','Allopark','ParkingList'][i%4],product:['FSP-V-F','AG-V-C','AP-V-C','Web-V-F'][i%4],covered:i%2===1,arrival_at:utc(day()+'T'+String(6+i).padStart(2,'0')+':30'),departure_at:utc(day()+'T'+String(14+i).padStart(2,'0')+':15'),checked_in_at:i>3?new Date().toISOString():null,flight_in:['EW 9462','LH 2010','QR 87','IB 1326'][i%4],flight_out:['EW 9463','LH 2011','QR 88','IB 1327'][i%4],total:90+i*10,paid:i%3?90+i*10:0,key_cash:i%2?'10€ Wael':'',spot:String(i+1),persons:1+i%4,phone:'+49 000 000000',comment:i===0?'Demobuchung. Keine echten Kundendaten.':''}))}

export function eventTime(b:Booking,kind:'in'|'out',useFlights:boolean):string{const checked=kind==='in'?b.checked_in_at:b.checked_out_at;if(checked)return checked;const fl=kind==='in'?b.actual_flight_in:b.actual_flight_out;if(useFlights&&fl)return fl;return kind==='in'?b.arrival_at:b.departure_at}

// Names are part of identity: partners routinely reuse the same inbox/phone for unrelated people.
export function customerIdentity(b:Booking):string {
 const name=b.customer_name.trim().toLocaleLowerCase('de-DE').replace(/\s+/g,' ');
 if(!name)return 'booking:'+b.id;
 const contact=b.email.trim().toLowerCase()||b.phone.replace(/[^+\d]/g,'');
 // A name alone is not a reliable unique identity.
 return contact?'customer:'+JSON.stringify([name,contact]):'booking:'+b.id;
}
export function occupancyDays(rows:Booking[],start=day(),count=7,capacity=350):{date:string;peak:number;capacity:number}[] {
 const intervals=rows.filter(b=>b.status==='confirmed').map(b=>({
  start:Date.parse(b.checked_in_at||b.arrival_at),end:Date.parse(b.checked_out_at||b.departure_at)
 })).filter(x=>Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start);
 return Array.from({length:count},(_,i)=>{
  const d=new Date(start+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+i);const date=d.toISOString().slice(0,10);
  d.setUTCDate(d.getUTCDate()+1);const endDate=d.toISOString().slice(0,10);
  const lo=Date.parse(utc(date+'T00:00')),hi=Date.parse(utc(endDate+'T00:00'));
  let current=intervals.filter(x=>x.start<=lo&&x.end>lo).length,peak=current;
  const changes=intervals.flatMap(x=>[...(x.start>lo&&x.start<hi?[{at:x.start,delta:1}]:[]),...(x.end>lo&&x.end<hi?[{at:x.end,delta:-1}]:[])]).sort((a,b)=>a.at-b.at||a.delta-b.delta);
  for(const x of changes){current+=x.delta;peak=Math.max(peak,current)}
  return{date,peak,capacity};
 });
}
