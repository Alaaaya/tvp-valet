import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {firstUpcomingIndex,nowTarget,scrollListToIndex} from './now-scroll';
import {defaultMainFilters,mainBookingEvents} from './booking-filters';
import {blank,utc,type Booking} from '../model';
const row=(x:Partial<Booking>):Booking=>({...blank(),status:'confirmed',product:'AG-V-F',arrival_at:utc('2026-10-17T10:00'),departure_at:utc('2026-10-18T12:00'),...x});
afterEach(()=>vi.useRealTimers());
describe('Now target',()=>{
 it('first event >= now, equal counts, none => -1, empty safe',()=>{const t=['2026-10-17T08:00:00Z','2026-10-17T10:00:00Z','2026-10-17T12:00:00Z'];expect(firstUpcomingIndex(t,Date.parse(t[1]))).toBe(1);expect(firstUpcomingIndex(t,Date.parse(t[1])+1)).toBe(2);expect(firstUpcomingIndex(t,Date.parse(t[2])+1)).toBe(-1);expect(firstUpcomingIndex([],1)).toBe(-1)});
 it('Berlin day boundary with fake clock',()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-17T21:59:00Z'));expect(nowTarget([]).date).toBe('2026-10-17');vi.setSystemTime(new Date('2026-10-17T22:00:00Z'));expect(nowTarget([]).date).toBe('2026-10-18');vi.setSystemTime(new Date('2026-03-29T22:30:00Z'));expect(nowTarget([]).date).toBe('2026-03-30')});
 it('uses actual-first/effective times, honors completed toggle',()=>{
  const rows=[row({id:'a',arrival_at:utc('2026-10-17T09:00'),checked_in_at:'2026-10-17T11:30:00Z'}),row({id:'b',arrival_at:utc('2026-10-17T14:00')})];
  const ev=(done:boolean)=>mainBookingEvents(rows,'2026-10-17',{...defaultMainFilters(),done,type:'in',flights:false},'u');
  const now=new Date('2026-10-17T11:00:00Z');
  expect(ev(false).map(e=>e.b.id)).toEqual(['b']);expect(nowTarget(ev(false).map(e=>e.time),now).index).toBe(0);
  expect(ev(true).map(e=>e.b.id)).toEqual(['a','b']);expect(nowTarget(ev(true).map(e=>e.time),now).index).toBe(0);
  expect(nowTarget(ev(true).map(e=>e.time),new Date('2026-10-17T11:45:00Z')).index).toBe(1);
 });
});
describe('scrollListToIndex',()=>{
 const mk=(n:number)=>{const kids=Array.from({length:n},(_,i)=>({getBoundingClientRect:()=>({top:100+i*50-list.scrollTop})}));const list:any={children:kids,scrollTop:0,scrollHeight:999,getBoundingClientRect:()=>({top:100})};return list};
 it('scrolls inner list to row, end if none, safe on null/empty',()=>{const l=mk(5);scrollListToIndex(l,3);expect(l.scrollTop).toBe(150);const e=mk(5);scrollListToIndex(e,-1);expect(e.scrollTop).toBe(999);expect(()=>{scrollListToIndex(null,0);scrollListToIndex(mk(0),0);scrollListToIndex(mk(2),9)}).not.toThrow()});
 it('Now button wired after render on list ref',()=>{const s=readFileSync('src/main.tsx','utf8');expect(s).toContain('onClick={goNow}');expect(s).toContain('ref={listRef}');expect(s).toMatch(/useEffect\(\(\)=>\{if\(!nowReq\)return/)});
});
