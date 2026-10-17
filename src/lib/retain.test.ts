import {describe,it,expect} from 'vitest';
import {mergeLive,markStale} from './retain';
const f=(n:string)=>({flightNumber:n,actual:'2026-10-17T10:00:37Z'}) as never;
describe('retention',()=>{
 it('keeps landed flight absent from successful response as stale',()=>{
  const prev={'2026-10-17|BK1':f('BK1')};
  const r=mergeLive(prev,{},'2026-10-17',['BK1'],[],'T1');
  expect(r.live['2026-10-17|BK1']).toBeTruthy();expect(r.stale['2026-10-17|BK1']).toBe('T1');
 });
 it('fresh data clears stale and never crosses dates',()=>{
  const prev={'2026-10-16|BK1':f('BK1')};
  const r=mergeLive(prev,{},'2026-10-17',['BK1'],[],'T1');
  expect(r.live['2026-10-17|BK1']).toBeUndefined();
  const r2=mergeLive({'2026-10-17|BK1':f('BK1')},{'2026-10-17|BK1':'T0'},'2026-10-17',['BK1'],[f('BK1')],'T2');
  expect(r2.stale['2026-10-17|BK1']).toBeUndefined();
 });
 it('marks stale on error',()=>{expect(markStale({'d|X':f('X')},{},'d','T')['d|X']).toBe('T')});
});
import {normalizeFlightNumber} from '../../supabase/functions/_shared/flights';
describe('normalization',()=>{it('client and server key agree',()=>{expect(normalizeFlightNumber('A3 0540')).toBe('A3540');expect(normalizeFlightNumber('a30540')).toBe('A3540')})});
