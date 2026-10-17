import {day,type Booking} from '../model';
export const createdOn=(rows:readonly Booking[],date:string)=>rows.filter(b=>Number.isFinite(Date.parse(b.created_at))&&day(b.created_at)===date).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
export function newTodaySummary(rows:readonly Booking[],date:string){const list=createdOn(rows,date);return{list,created:list.length,arriving:list.filter(b=>Number.isFinite(Date.parse(b.arrival_at))&&day(b.arrival_at)===date).length}}
export const todayCreatedCount=(rows:readonly Booking[],now:Date=new Date())=>createdOn(rows,day(now)).length;
export function shiftDate(date:string,n:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export const shortDate=(date:string)=>{const[y,m,d]=date.split('-');return d+'.'+m+'.'+y.slice(2)};
export const IMPORT_NOTE='Erstellt zeigt das gespeicherte Erstellungsdatum. ParkingPro-Importe übernehmen das ursprüngliche Datum. Fehlt dieses in einer Importquelle, kann der Importzeitpunkt verwendet werden.';
