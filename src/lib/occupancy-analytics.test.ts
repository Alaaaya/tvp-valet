import {describe,it,expect} from 'vitest';
import {blank,utc} from '../model';
import type {Booking} from '../model';
import {occupancyAnalytics} from './occupancy-analytics';

const now=new Date('2026-10-17T12:00:00Z');
const at=(arrival:string,departure:string,extra:Partial<Booking>={}):Booking=>({
 ...blank(),arrival_at:utc(arrival),departure_at:utc(departure),...extra
});
const run=(rows:readonly Booking[],start='2026-10-17',count=1)=>occupancyAnalytics(rows,start,count,now);
describe('read-only occupancy analytics',()=>{
 it('uses actual endpoints before planned and ignores flight times',()=>{
  const row=at('2026-10-16T08:00','2026-10-19T09:00',{
   checked_in_at:utc('2026-10-17T08:00'),checked_out_at:utc('2026-10-17T09:00'),
   actual_flight_in:utc('2026-10-15T08:00'),actual_flight_out:utc('2026-10-20T09:00')});
  expect(run([row],'2026-10-16',3).days.map(d=>d.maximum)).toEqual([0,1,0]);
  expect(run([row]).parkedNow).toBe(0);
 });
 it('projects unchecked past and future arrivals using planned endpoints',()=>{
  const rows=[at('2026-10-17T08:00','2026-10-17T09:00'),at('2026-10-18T08:00','2026-10-18T09:00')];
  expect(run(rows,'2026-10-17',2).days.map(d=>[d.arriving,d.departing,d.maximum,d.endOfDay])).toEqual([[1,1,1,0],[1,1,1,0]]);
  expect(run(rows).parkedNow).toBe(0);
 });
 it('excludes cancellations and explicit no-shows',()=>{
  expect(run([at('2026-10-17T08:00','2026-10-18T09:00',{status:'cancelled'}),at('2026-10-17T08:00','2026-10-18T09:00',{status:'no_show'})]).days[0].maximum).toBe(0);
 });
 it('excludes actual same-epoch-minute no-shows even when seconds differ',()=>{
  const row=at('2026-10-17T08:00','2026-10-18T09:00',{checked_in_at:'2026-10-17T08:00:01Z',checked_out_at:'2026-10-17T08:00:59Z'});
  expect(run([row]).days[0].maximum).toBe(0);
  expect(run([{...row,checked_out_at:'2026-10-17T08:01:00Z'}]).days[0].maximum).toBe(1);
 });
 it('rejects invalid, reversed and empty durations without falling back from invalid actual',()=>{
  const base=at('2026-10-17T08:00','2026-10-17T09:00');
  const rows=[{...base,id:'a',arrival_at:'bad'},{...base,id:'b',departure_at:base.arrival_at},{...base,id:'c',departure_at:utc('2026-10-16T08:00')},{...base,id:'d',checked_in_at:'bad'},{...base,id:'e',checked_out_at:'bad'}];
  expect(run(rows)).toEqual({days:[{date:'2026-10-17',arriving:0,departing:0,maximum:0,endOfDay:0}],parkedNow:0,overdueNow:0});
 });
 it('groups exact-time swaps before taking the maximum',()=>{
  const first=at('2026-10-17T08:00','2026-10-17T09:00');
  const second=at('2026-10-17T09:00','2026-10-17T10:00');
  expect(run([second,first]).days[0]).toEqual({date:'2026-10-17',arriving:2,departing:2,maximum:1,endOfDay:0});
 });
 it('attributes midnight arrivals and departures to the new day, with half-open stays',()=>{
  const row=at('2026-10-17T00:00','2026-10-18T00:00');
  expect(run([row],'2026-10-16',3).days).toEqual([
   {date:'2026-10-16',arriving:0,departing:0,maximum:0,endOfDay:0},
   {date:'2026-10-17',arriving:1,departing:0,maximum:1,endOfDay:1},
   {date:'2026-10-18',arriving:0,departing:1,maximum:0,endOfDay:0}
  ]);
 });
 it('carries checked-in overdue stays indefinitely without inventing departure events',()=>{
  const row=at('2026-10-16T08:00','2026-10-17T12:00',{checked_in_at:utc('2026-10-16T08:05')});
  const result=run([row],'2026-10-17',30);
  expect(result.parkedNow).toBe(1);expect(result.overdueNow).toBe(1);
  expect(result.days.every(d=>d.maximum===1&&d.endOfDay===1&&d.departing===0)).toBe(true);
 });
 it('carries a real late check-in after its obsolete planned departure',()=>{
  const row=at('2026-10-16T08:00','2026-10-16T12:00',{checked_in_at:utc('2026-10-17T08:00')});
  const result=run([row],'2026-10-17',30);
  expect(result.parkedNow).toBe(1);expect(result.overdueNow).toBe(1);
  expect(result.days[0].arriving).toBe(1);
  expect(result.days.every(d=>d.maximum===1&&d.endOfDay===1&&d.departing===0)).toBe(true);
 });
 it('does not interpret a malformed planned departure as overdue infinity',()=>{
  const row=at('2026-10-16T08:00','2026-10-16T12:00',{checked_in_at:utc('2026-10-17T08:00'),departure_at:'invalid'});
  expect(run([row])).toMatchObject({parkedNow:0,overdueNow:0,days:[{maximum:0,endOfDay:0}]});
  // A valid actual checkout still supersedes malformed planned departure.
  expect(run([{...row,checked_out_at:utc('2026-10-17T15:00')}])).toMatchObject({parkedNow:1,overdueNow:0,days:[{maximum:1,departing:1}]});
 });
 it('does not repair reversed actual endpoints or unchecked reversed plans',()=>{
  const row=at('2026-10-17T08:00','2026-10-16T12:00');
  expect(run([row]).days[0].maximum).toBe(0);
  expect(run([{...row,checked_in_at:utc('2026-10-17T08:00'),checked_out_at:utc('2026-10-16T12:00')}]).parkedNow).toBe(0);
 });
 it('considers a planned departure exactly now overdue',()=>{
  const row=at('2026-10-16T08:00','2026-10-17T14:00',{checked_in_at:utc('2026-10-16T08:00')});
  expect(run([row]).overdueNow).toBe(1);
 });
 it('uses future planned departure but actual checkout overrides an overdue plan',()=>{
  const row=at('2026-10-16T08:00','2026-10-18T09:00',{checked_in_at:utc('2026-10-16T08:00')});
  expect(run([row],'2026-10-17',2)).toMatchObject({parkedNow:1,overdueNow:0,days:[{endOfDay:1},{departing:1,endOfDay:0}]});
  const checked={...row,departure_at:utc('2026-10-16T09:00'),checked_out_at:utc('2026-10-17T15:00')};
  expect(run([checked])).toMatchObject({parkedNow:1,overdueNow:0,days:[{departing:1,endOfDay:0}]});
  expect(occupancyAnalytics([checked],'2026-10-17',1,new Date(checked.checked_out_at!)).parkedNow).toBe(0);
 });
 it('does not count a future actual check-in as parked now',()=>{
  const row=at('2026-10-18T08:00','2026-10-19T09:00',{checked_in_at:utc('2026-10-18T08:00')});
  expect(run([row]).parkedNow).toBe(0);
 });
 it.each([
  ['2026-03-29','2026-03-28T23:00:00Z','2026-03-29T22:00:00Z'],
  ['2026-10-25','2026-10-24T22:00:00Z','2026-10-25T23:00:00Z']
 ])('respects Berlin DST day %s', (date,start,end)=>{
  const row={...blank(),arrival_at:start,departure_at:end};
  const result=run([row],date,2);
  expect(result.days.map(d=>[d.arriving,d.departing,d.maximum,d.endOfDay])).toEqual([[1,0,1,1],[0,1,0,0]]);
 });
 it('includes both occurrences of the repeated autumn hour',()=>{
  const a={...blank(),arrival_at:'2026-10-25T00:15:00Z',departure_at:'2026-10-25T00:45:00Z'};
  const b={...blank(),arrival_at:'2026-10-25T01:15:00Z',departure_at:'2026-10-25T01:45:00Z'};
  expect(run([a,b],'2026-10-25').days[0]).toMatchObject({arriving:2,departing:2,maximum:1});
 });
 it('deduplicates ids first-wins without merging distinct ids',()=>{
  const row=at('2026-10-17T08:00','2026-10-18T09:00');
  expect(run([row,{...row}, {...row,id:'different'}]).days[0].maximum).toBe(2);
 });
 it('never mutates even frozen booking objects or arrays',()=>{
  const rows=Object.freeze([Object.freeze(at('2026-10-17T08:00','2026-10-18T09:00'))]);
  const before=JSON.stringify(rows);run(rows);expect(JSON.stringify(rows)).toBe(before);
 });
 it('validates range parameters and supports an empty day range',()=>{
  expect(()=>run([],'2026-02-30')).toThrow(RangeError);
  expect(()=>run([],'2026-10-17',-1)).toThrow(RangeError);
  expect(()=>run([],'2026-10-17',1.5)).toThrow(RangeError);
  expect(()=>occupancyAnalytics([],'2026-10-17',1,new Date('bad'))).toThrow(RangeError);
  expect(run([],'2026-10-17',0)).toEqual({days:[],parkedNow:0,overdueNow:0});
 });
});
