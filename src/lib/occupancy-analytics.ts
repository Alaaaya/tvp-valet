import {t as tr} from './i18n';
import {withoutQaFixtures} from './qa-fixtures';
import {fromZonedTime} from 'date-fns-tz';
import {day,TZ,type Booking} from '../model';

export type OccupancyDay={date:string;arriving:number;departing:number;maximum:number;endOfDay:number};
export type OccupancyAnalytics={days:OccupancyDay[];parkedNow:number;overdueNow:number};
type Interval={start:number;end:number};

/** Calendar arithmetic only. Each midnight is converted independently in Berlin. */
function calendarDate(start:string,offset:number):string {
 const value=new Date(start+'T12:00:00Z');
 value.setUTCDate(value.getUTCDate()+offset);
 return value.toISOString().slice(0,10);
}

/** Read-only imported-data projection, not a physical inventory or capacity guarantee. */
export function occupancyAnalytics(allRows:readonly Booking[],start=day(),count=30,now=new Date()):OccupancyAnalytics {
 const rows=withoutQaFixtures(allRows);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!Number.isFinite(Date.parse(start+'T12:00:00Z'))||calendarDate(start,0)!==start)
  throw new RangeError(tr("Invalid start date"));
 if(!Number.isSafeInteger(count)||count<0)throw new RangeError(tr("Invalid day count"));
 const nowMs=now.getTime();
 if(!Number.isFinite(nowMs))throw new RangeError(tr("Invalid current time"));
 const seen=new Set<string>(),intervals:Interval[]=[];
 let parkedNow=0,overdueNow=0;
 for(const row of rows){
  if(seen.has(row.id))continue;
  seen.add(row.id);
  if(row.status!=='confirmed')continue;
  const actualStart=row.checked_in_at===null?null:Date.parse(row.checked_in_at);
  const actualEnd=row.checked_out_at===null?null:Date.parse(row.checked_out_at);
  if(actualStart!==null&&actualEnd!==null&&Math.floor(actualStart/60000)===Math.floor(actualEnd/60000))continue;
  const from=actualStart??Date.parse(row.arrival_at);
  const plannedEnd=Date.parse(row.departure_at);
  const selectedEnd=actualEnd??plannedEnd;
  // A malformed selected timestamp is not an overdue return estimate.
  if(!Number.isFinite(from)||!Number.isFinite(selectedEnd))continue;
  const parked=actualStart!==null&&actualStart<=nowMs&&(actualEnd===null||actualEnd>nowMs);
  const overdue=parked&&actualEnd===null&&plannedEnd<=nowMs;
  // A real late check-in may follow its obsolete planned departure.
  // Carry that overdue stay first, then validate the effective interval.
  const to=overdue?Infinity:selectedEnd;
  if(to<=from)continue;
  if(parked)parkedNow++;
  if(overdue)overdueNow++;
  intervals.push({start:from,end:to});
 }
 const days=Array.from({length:count},(_,i)=>{
  const date=calendarDate(start,i);
  const lo=fromZonedTime(date+'T00:00:00',TZ).getTime();
  const hi=fromZonedTime(calendarDate(start,i+1)+'T00:00:00',TZ).getTime();
  let arriving=0,departing=0,current=0;
  const changes=new Map<number,number>();
  for(const interval of intervals){
   if(interval.start>=lo&&interval.start<hi)arriving++;
   if(interval.end>=lo&&interval.end<hi)departing++;
   if(interval.start<=lo&&interval.end>lo)current++;
   for(const [at,delta] of [[interval.start,1],[interval.end,-1]]){
    if(at>lo&&at<hi)changes.set(at,(changes.get(at)??0)+delta);
   }
  }
  let maximum=current;
  for(const [,delta] of [...changes].sort((a,b)=>a[0]-b[0])){
   current+=delta;
   maximum=Math.max(maximum,current);
  }
  return {date,arriving,departing,maximum,endOfDay:current};
 });
 return {days,parkedNow,overdueNow};
}
