import {describe,it,expect} from 'vitest';
import {nextDay,delayText} from './flightview';
import {berlinMidnight} from '../../supabase/functions/_shared/flights';
describe('flightview',()=>{
 it('nextDay crosses month/year',()=>{expect(nextDay('2026-12-31')).toBe('2027-01-01');expect(nextDay('2026-02-28')).toBe('2026-03-01')});
 it('DST day is 25h in autumn, 23h in spring',()=>{const h=(a:string)=>(Date.parse(berlinMidnight(nextDay(a)))-Date.parse(berlinMidnight(a)))/36e5;expect(h('2026-10-25')).toBe(25);expect(h('2026-03-29')).toBe(23);expect(h('2026-10-17')).toBe(24)});
 it('delay sign',()=>{expect(delayText(12)).toBe('+12′');expect(delayText(-5)).toBe('−5′');expect(delayText(0)).toBe('');expect(delayText(null)).toBe('')});
});

import {resolveEventTime,liveForDate,inDateWindow} from './flightview';
import {blank,day,utc} from '../model';
import type {FlightUpdate} from './flights';
const lf={flightNumber:'XQ794',scheduled:utc('2026-10-17T09:50'),estimated:utc('2026-10-17T09:44'),actual:null,status:'approaching',statusText:'Anflug',delayMinutes:-6,source:'DUS',updatedAt:'2026-10-17T08:00:00Z'} as FlightUpdate;
describe('live event priority and date/toggle isolation',()=>{
 const b={...blank(),flight_in:'EW100',flight_out:'XQ794',arrival_at:utc('2026-10-17T04:00'),departure_at:utc('2026-10-17T12:00')};
 it('uses live return only when enabled',()=>{expect(resolveEventTime(b,'out',true,lf)).toBe(lf.estimated);expect(resolveEventTime(b,'out',false,lf)).toBe(b.departure_at);expect(resolveEventTime(b,'in',true,lf)).toBe(b.arrival_at)});
 it('preserves manual records over live, but respects toggle',()=>{const x={...b,actual_flight_out:utc('2026-10-17T09:52')};expect(resolveEventTime(x,'out',true,lf)).toBe(x.actual_flight_out);expect(resolveEventTime(x,'out',false,lf)).toBe(x.departure_at)});
 it('checkout after midnight always beats live and planned date',()=>{const x={...b,departure_at:utc('2026-10-16T23:00'),checked_out_at:utc('2026-10-17T00:07')};for(const toggle of[true,false]){expect(day(resolveEventTime(x,'out',toggle,lf))).toBe('2026-10-17');expect(resolveEventTime(x,'out',toggle,lf)).toBe(x.checked_out_at)}});
 it('same flight on different days cannot leak across dates',()=>{const cache={'2026-10-17|XQ794':lf};expect(liveForDate(cache,b,true)).toBe(lf);expect(liveForDate(cache,{...b,departure_at:utc('2026-10-18T12:00')},true)).toBeUndefined();expect(liveForDate(cache,b,false)).toBeUndefined();expect(liveForDate(cache,{...b,flight_out:'badflight'},true)).toBeUndefined()});
 it('empty live timestamps fall back to booking plan',()=>{expect(resolveEventTime(b,'out',true,{...lf,actual:null,estimated:null,scheduled:null})).toBe(b.departure_at)});
 it('uses actual over estimated over scheduled from independent source',()=>{expect(resolveEventTime(b,'out',true,{...lf,actual:utc('2026-10-17T09:40')})).toBe(utc('2026-10-17T09:40'));expect(resolveEventTime(b,'out',true,{...lf,estimated:null})).toBe(lf.scheduled)});
 it('half-open date window plus before/after boundary hours',()=>{expect(inDateWindow(utc('2026-10-17T00:00'),'2026-10-17')).toBe(true);expect(inDateWindow(utc('2026-10-18T00:00'),'2026-10-17')).toBe(false);expect(inDateWindow(utc('2026-10-16T23:00'),'2026-10-17',2)).toBe(true);expect(inDateWindow(utc('2026-10-18T01:00'),'2026-10-17',0,2)).toBe(true)});
 it('covers full local DST day and no next-day leakage',()=>{expect(inDateWindow('2026-10-25T22:59:59Z','2026-10-25')).toBe(true);expect(inDateWindow('2026-10-25T23:00:00Z','2026-10-25')).toBe(false);expect(inDateWindow('2026-03-29T21:59:59Z','2026-03-29')).toBe(true);expect(inDateWindow('2026-03-29T22:00:00Z','2026-03-29')).toBe(false)});
});
