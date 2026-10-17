import type {Booking} from '../model';
export const SERVICE_TYPES=['Shuttle','Valet','Terminal','Cruise','Valet/Shuttle','Shuttle/Valet'] as const;
export type ServiceType=typeof SERVICE_TYPES[number];
export type NewFilter={v:1;cancelled:boolean;deleted:boolean;rejected:boolean;noShow:boolean;airportOn:boolean;airport:string;locationOn:boolean;location:string;services:ServiceType[]};
export const DEFAULT_FILTER:NewFilter={v:1,cancelled:false,deleted:false,rejected:false,noShow:false,airportOn:false,airport:'',locationOn:false,location:'',services:[]};
// Real data mapping. Bookings only carry status (confirmed/cancelled/no_show), a product code and a covered flag.
// There is no deleted/rejected state, no airport and no service type column, so those cannot be filtered.
export const AVAILABLE={cancelled:true,noShow:true,deleted:false,rejected:false,airport:false,location:true} as const;
// Only Valet is verifiable from product codes (e.g. AP-V-C, FSP-V-F, AG-V-C, Web-V-F, VALET-F).
export function serviceOf(b:Pick<Booking,'product'>):ServiceType|null{const p=(b.product||'').toUpperCase();return p.split('-').includes('V')||p.startsWith('VALET')?'Valet':null}
export const SERVICE_AVAILABLE:Record<ServiceType,boolean>={Shuttle:false,Valet:true,Terminal:false,Cruise:false,'Valet/Shuttle':false,'Shuttle/Valet':false};
export const locationOptions=(rows:readonly Booking[])=>Array.from(new Set(rows.map(b=>b.product).filter(Boolean))).sort();
export function applyNewFilter(rows:readonly Booking[],f:NewFilter):Booking[]{
  const sv=f.services.filter(s=>SERVICE_AVAILABLE[s]);
  return rows.filter(b=>(f.cancelled||b.status!=='cancelled')&&(f.noShow||b.status!=='no_show')&&(!f.locationOn||!f.location||b.product===f.location)&&(!sv.length||sv.includes(serviceOf(b) as ServiceType)));
}
export const activeCount=(f:NewFilter)=>[f.cancelled,f.noShow,f.locationOn&&!!f.location,f.services.some(s=>SERVICE_AVAILABLE[s])].filter(Boolean).length;
export const filterKey=(userId:string)=>'tvp.newFilter.v1.'+userId;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const store=():Store|null=>{try{return typeof window!=='undefined'?window.localStorage:null}catch{return null}};
export function parseFilter(raw:string|null):NewFilter{
  try{const o=JSON.parse(raw||'');if(!o||o.v!==1)return DEFAULT_FILTER;const t=(x:unknown)=>x===true;
    return{v:1,cancelled:t(o.cancelled),deleted:t(o.deleted),rejected:t(o.rejected),noShow:t(o.noShow),airportOn:t(o.airportOn),airport:typeof o.airport==='string'?o.airport:'',locationOn:t(o.locationOn),location:typeof o.location==='string'?o.location:'',services:Array.isArray(o.services)?SERVICE_TYPES.filter(s=>o.services.includes(s)):[]}}
  catch{return DEFAULT_FILTER}}
export function loadFilter(userId:string|undefined,s:Store|null=store()):NewFilter{if(!userId||!s)return DEFAULT_FILTER;try{return parseFilter(s.getItem(filterKey(userId)))}catch{return DEFAULT_FILTER}}
export function saveFilter(userId:string|undefined,f:NewFilter,s:Store|null=store()){if(!userId||!s)return;try{s.setItem(filterKey(userId),JSON.stringify(f))}catch{}}
