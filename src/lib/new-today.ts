import {day,type Booking} from '../model';
export const createdOn=(rows:readonly Booking[],date:string)=>rows.filter(b=>day(b.created_at)===date).sort((a,b)=>a.created_at<b.created_at?1:a.created_at>b.created_at?-1:0);
export function newTodaySummary(rows:readonly Booking[],date:string){const list=createdOn(rows,date);return{list,created:list.length,arriving:list.filter(b=>day(b.arrival_at)===date).length}}
export const todayCreatedCount=(rows:readonly Booking[],now:Date=new Date())=>createdOn(rows,day(now)).length;
export function shiftDate(date:string,n:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export const shortDate=(date:string)=>{const[y,m,d]=date.split('-');return d+'.'+m+'.'+y.slice(2)};
export const IMPORT_NOTE='Erstellt = Zeitpunkt, zu dem die Buchung in dieser App angelegt wurde. Importierte Buchungen zeigen den Importzeitpunkt, nicht das ursprüngliche Buchungsdatum bei der Plattform.';
