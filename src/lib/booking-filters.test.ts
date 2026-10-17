import {describe,it,expect} from 'vitest';
import {blank,utc,type Booking} from '../model';
import {defaultMainFilters,normalizeMainFilters,mainBookingEvents,mainFiltersKey,readMainFilters,writeMainFilters,bookingService} from './booking-filters';
const row=(extra:Partial<Booking>={}):Booking=>({...blank(),product:'AG-V-F',arrival_at:utc('2026-10-17T10:00'),departure_at:utc('2026-10-18T12:00'),...extra});
const events=(rows:Booking[],extra:Partial<ReturnType<typeof defaultMainFilters>>={},date='2026-10-17',user='u')=>mainBookingEvents(rows,date,{...defaultMainFilters(),...extra},user);
describe('main booking filters',()=>{
 it('defaults match master-on outbound-off return-on and reset creates fresh lists',()=>{const a=defaultMainFilters();expect(a).toMatchObject({flights:true,flInOn:false,flOutOn:true,before:0,after:0,type:'all',done:false});a.products.push('test');expect(defaultMainFilters().products).toEqual([])});
 it('hides completed per event not whole booking',()=>{const b=row({checked_in_at:utc('2026-10-17T10:05'),departure_at:utc('2026-10-17T14:00')});expect(events([b]).map(e=>e.kind)).toEqual(['out']);expect(events([b],{done:true}).map(e=>e.kind)).toEqual(['in','out'])});
 it('checks actual timestamps before optional recorded flights and planned times',()=>{const b=row({checked_in_at:utc('2026-10-17T09:00'),actual_flight_in:utc('2026-10-16T09:00')});expect(events([b],{done:true,flInOn:true})[0].time).toBe(b.checked_in_at)});
 it('applies flight master and direction subtoggles independently',()=>{
  const b=row({actual_flight_in:utc('2026-10-18T08:00'),actual_flight_out:utc('2026-10-17T13:00')});
  expect(events([b]).map(e=>e.kind)).toEqual(['in','out']);
  expect(events([b],{flights:false}).map(e=>e.kind)).toEqual(['in']);
  expect(events([b],{flInOn:true}).map(e=>e.kind)).toEqual(['out']);
  expect(events([b],{flOutOn:false}).map(e=>e.kind)).toEqual(['in']);
 });
 it('never invents times from flight numbers',()=>{const b=row({flight_in:'EW1234',flight_out:'EW4321'});expect(events([b])[0].time).toBe(b.arrival_at)});
 it('does not invoke live-return resolver while master or return is disabled',()=>{
  const b=row();let calls=0;const live=()=>{calls++;return undefined};
  mainBookingEvents([b],'2026-10-17',{...defaultMainFilters(),flights:false},'u','',live);
  mainBookingEvents([b],'2026-10-17',{...defaultMainFilters(),flOutOn:false},'u','',live);expect(calls).toBe(0);
  mainBookingEvents([b],'2026-10-17',defaultMainFilters(),'u','',live);expect(calls).toBe(1);
 });
 it('enabled live return crosses Berlin date boundary without moving incoming event',()=>{
  const b=row({arrival_at:utc('2026-10-16T08:00'),departure_at:utc('2026-10-17T23:50'),flight_out:'EW1'});
  const live={flightNumber:'EW1',scheduled:b.departure_at,estimated:utc('2026-10-18T00:15'),actual:null,status:'delayed' as const,statusText:null,delayMinutes:25,source:'fixture',updatedAt:utc('2026-10-17T20:00')};
  expect(mainBookingEvents([b],'2026-10-17',defaultMainFilters(),'u','',()=>live)).toEqual([]);
  expect(mainBookingEvents([b],'2026-10-18',defaultMainFilters(),'u','',()=>live).map(e=>[e.kind,e.time])).toEqual([['out',live.estimated]]);
  expect(mainBookingEvents([b],'2026-10-17',{...defaultMainFilters(),flights:false},'u','',()=>live).map(e=>e.kind)).toEqual(['out']);
 });
 it('uses explicit canceled/no-show toggles including same-minute implicit no-shows',()=>{
  const c=row({status:'cancelled'}),n=row({status:'no_show'}),implicit=row({checked_in_at:utc('2026-10-17T10:00'),checked_out_at:utc('2026-10-17T10:00')});
  expect(events([c,n,implicit])).toHaveLength(0);expect(events([c],{cancelled:true})).toHaveLength(1);expect(events([n,implicit],{noshow:true})).toHaveLength(3);
 });
 it('explicit canceled status wins over implicit same-minute timestamps',()=>{const b=row({status:'cancelled',checked_in_at:utc('2026-10-17T10:00'),checked_out_at:utc('2026-10-17T10:00')});expect(events([b],{cancelled:true})).toHaveLength(2);expect(events([b],{noshow:true})).toHaveLength(0)});
 it('same-minute detection uses epoch minute, not repeated Berlin wall hour',()=>{const b=row({arrival_at:'2026-10-25T00:30:01Z',departure_at:'2026-10-25T01:30:05Z',checked_in_at:'2026-10-25T00:30:01Z',checked_out_at:'2026-10-25T01:30:05Z'});expect(events([b],{done:true},'2026-10-25')).toHaveLength(2);const same={...b,checked_out_at:'2026-10-25T00:30:59Z'};expect(events([same],{done:true},'2026-10-25')).toHaveLength(0)});
 it('assignment never matches unknown signed-in identity',()=>{const b=row({driver_id:'u'});expect(events([b],{assigned:true})).toHaveLength(1);expect(events([b],{assigned:true},'2026-10-17','')).toHaveLength(0);expect(events([row()],{assigned:true})).toHaveLength(0)});
 it('uses only real product and covered/open placement fields and exact recognized services',()=>{const a=row({covered:true}),b=row({product:'unknown'});expect(bookingService(a)).toBe('Valet');expect(bookingService(b)).toBeNull();expect(events([a,b],{services:['Valet']})).toHaveLength(1);expect(events([a],{services:['Valet/Shuttle']})).toHaveLength(0);expect(events([a],{placements:['open']})).toHaveLength(0);expect(events([a],{products:['AP-V-C']})).toHaveLength(0)});
 it('filters incoming and outgoing directions separately',()=>{const b=row({departure_at:utc('2026-10-17T14:00')});expect(events([b],{type:'in'}).map(e=>e.kind)).toEqual(['in']);expect(events([b],{type:'out'}).map(e=>e.kind)).toEqual(['out'])});
 it.each([['2026-03-29','2026-03-28T23:00:00Z','2026-03-29T22:00:00Z'],['2026-10-25','2026-10-24T22:00:00Z','2026-10-25T23:00:00Z']])('uses independent Berlin midnight boundaries through DST %s',(date,lo,hi)=>{
  const b=row({arrival_at:lo,departure_at:hi});expect(events([b],{done:true},date).map(e=>e.kind)).toEqual(['in']);
  const ext=events([b],{before:1,after:1},date);expect(ext.map(e=>e.kind)).toEqual(['in','out']);
  const previous=row({arrival_at:new Date(Date.parse(lo)-3600000).toISOString(),departure_at:new Date(Date.parse(hi)+3600000).toISOString()});
  expect(events([previous],{before:1,after:1},date).map(e=>e.kind)).toEqual(['in']);
 });
 it('supports fractional elapsed boundary hours and exclusive upper bound',()=>{const b=row({arrival_at:utc('2026-10-16T23:30'),departure_at:utc('2026-10-18T00:30')});expect(events([b])).toHaveLength(0);expect(events([b],{before:.5,after:.5}).map(e=>e.kind)).toEqual(['in'])});
 it('deduplicates, sorts by absolute timestamps and preserves frozen records',()=>{const a=Object.freeze(row()),b=Object.freeze(row({arrival_at:utc('2026-10-17T08:00')}));const rows=Object.freeze([a,a,b]);const before=JSON.stringify(rows);expect(mainBookingEvents(rows,'2026-10-17',defaultMainFilters(),'u').map(e=>e.b.id)).toEqual([b.id,a.id]);expect(JSON.stringify(rows)).toBe(before)});
 it('normalizes malformed saved filters and boundary values',()=>{expect(normalizeMainFilters({flights:'false',before:Infinity,after:-2,type:'oops',services:['Valet','bad'],products:['A','A',1],placements:['open','P2']})).toMatchObject({flights:true,before:0,after:0,type:'all',services:['Valet'],products:['A'],placements:['open']});expect(normalizeMainFilters({before:99}).before).toBe(24)});
 it('persists only a user-scoped own key and never clears auth or other filter page',()=>{
  const data=new Map([['sb-auth-token','keep'],['tvp.new-filters.u','keepnew']]);const storage={getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>{data.set(k,v)}};
  writeMainFilters(storage,'u',{...defaultMainFilters(),done:true});expect(readMainFilters(storage,'u').done).toBe(true);expect(readMainFilters(storage,'v').done).toBe(false);
  writeMainFilters(storage,'u',defaultMainFilters());expect(readMainFilters(storage,'u').done).toBe(false);expect(data.get('sb-auth-token')).toBe('keep');expect(data.get('tvp.new-filters.u')).toBe('keepnew');expect(mainFiltersKey('u')).not.toBe(mainFiltersKey('v'));
 });
 it('survives corrupt storage, unavailable storage and unsigned identity',()=>{const storage={getItem:()=>'{invalid',setItem:()=>{throw Error('quota')}};expect(readMainFilters(storage,'u')).toEqual(defaultMainFilters());expect(()=>writeMainFilters(storage,'u',defaultMainFilters())).not.toThrow();expect(readMainFilters(storage,'')).toEqual(defaultMainFilters())});
 it.each(['','bad','2026-02-30'])('handles incomplete/invalid date %s without crashing',date=>{expect(events([row()],{},date)).toEqual([])});
});
