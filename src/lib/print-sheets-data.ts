import {formatInTimeZone} from 'date-fns-tz';
import type {Booking} from '../model';
import {displayComment} from './comments';

/** One printable A4 booking sheet. Every field is plain text; empty string means "leave the line blank". */
export type SheetData={
 code:string;title:string;daysPersons:string;
 name:string;email:string;phone:string;source:string;
 brand:string;model:string;plate:string;color:string;
 dropoff:string;dropoffFlight:string;pickup:string;pickupFlight:string;
 remarks:string;
 paid:string;due:string;net:string;subtotal:string;vat:string;total:string;paidAmount:string;cashOnSite:string;
};

export const COMPANY={
 name:'Travel Valet Parking Düsseldorf',
 phone:'+49 163 9176557',
 email:'info.travelpark24@gmail.com',
 street:'Eduardstraße 13',city:'45468 Mülheim an der Ruhr',
 meetingPoint:'Düsseldorf Airport Terminal B/C Departures, Flughafenstraße 105, 40474 Düsseldorf',
};
export const VAT_RATE=0.19;

const TZ='Europe/Berlin';
/** Intl may emit NBSP/narrow NBSP; the PDF standard fonts only need plain spaces. */
const plain=(s:string)=>s.replace(/[\u00a0\u202f]/g,' ');
export function euro(n:number):string{return plain(new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n))}
export function sheetStamp(iso:string|null|undefined):string{
 if(!iso||!Number.isFinite(Date.parse(iso)))return '';
 return formatInTimeZone(iso,TZ,'dd.MM.yyyy HH:mm');
}
export function sheetDays(b:Pick<Booking,'arrival_at'|'departure_at'>):number{
 const ms=Date.parse(b.departure_at)-Date.parse(b.arrival_at);
 return Number.isFinite(ms)?Math.max(1,Math.ceil(ms/864e5)):1;
}
/** Imported notes carry vehicle JSON ({"brand":..,"type":..,"color":..}); read only those exact keys. */
export function vehicleFields(b:Pick<Booking,'comment'|'car_description'>):{brand:string;model:string;color:string}{
 const raw=b.comment||'';
 const pick=(key:string)=>{const m=raw.match(new RegExp('"'+key+'"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));if(!m)return '';try{return String(JSON.parse('"'+m[1]+'"')).trim()}catch{return m[1].trim()}};
 const brand=pick('brand'),model=pick('type'),color=pick('color');
 const desc=(b.car_description||'').trim()||pick('description');
 if(brand||model||color)return{brand:brand||desc,model,color};
 return{brand:desc,model:'',color:''};
}
export function sheetTitle(b:Pick<Booking,'product'|'covered'>):string{
 const valet=/-V-/i.test(b.product||'');
 const label=valet?'Valet '+(b.covered?'Überdacht':'Freifläche'):(b.product||'').trim();
 return label?'Reservierung ('+label+')':'Reservierung';
}
function moneyBlock(b:Pick<Booking,'total'|'paid'>){
 const total=Number(b.total),paid=Number(b.paid);
 if(!Number.isFinite(total)||total<=0){
  const p=Number.isFinite(paid)&&paid>0?euro(paid):'';
  return{paid:p,due:'',net:'',subtotal:'',vat:'',total:'',paidAmount:p,cashOnSite:''};
 }
 const totalC=Math.round(total*100),paidC=Math.max(0,Math.round((Number.isFinite(paid)?paid:0)*100));
 const netC=Math.round(totalC/(1+VAT_RATE)),vatC=totalC-netC,dueC=Math.max(0,totalC-paidC);
 const e=(c:number)=>euro(c/100);
 return{paid:e(paidC),due:e(dueC),net:e(netC),subtotal:e(netC),vat:e(vatC),total:e(totalC),paidAmount:e(paidC),cashOnSite:e(dueC)};
}
export function sheetData(b:Booking):SheetData{
 const v=vehicleFields(b);
 const name=(b.customer_name||'').trim()||[b.first_name,b.last_name].filter(Boolean).join(' ').trim();
 return{
  code:b.code||b.external_id||'',title:sheetTitle(b),daysPersons:sheetDays(b)+' / '+(b.persons>0?b.persons:1),
  name,email:(b.email||'').trim(),phone:(b.phone||'').trim(),source:(b.platform||'').trim(),
  brand:v.brand,model:v.model,plate:(b.plate||'').trim(),color:v.color,
  dropoff:sheetStamp(b.arrival_at),dropoffFlight:(b.flight_in||'').trim(),
  pickup:sheetStamp(b.departure_at),pickupFlight:(b.flight_out||'').trim(),
  remarks:displayComment(b.comment||'',true).text.trim(),
  ...moneyBlock(b),
 };
}
/** The day list holds arrival and return events; a booking with both on one day prints once. */
export function sheetsFor(items:readonly {b:Booking}[]):SheetData[]{
 const seen=new Set<string>(),out:SheetData[]=[];
 for(const {b} of items){if(seen.has(b.id))continue;seen.add(b.id);out.push(sheetData(b))}
 return out;
}
