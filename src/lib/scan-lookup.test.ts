import {describe,expect,it} from 'vitest';
import {blank,type Booking} from '../model';
import {matchesScan,resolveScan} from './scan-lookup';
const b=(x:Partial<Booking>):Booking=>({...blank(),...x});
const A=b({id:'1',plate:'D-AB 1234',code:'BKYBR'}),B=b({id:'2',plate:'DAB1234',code:'X2'}),C=b({id:'3',plate:'E-CD 55',code:'ZZZ99',external_id:'AL-1'});
describe('scan lookup',()=>{
 it('normalizes plates and codes',()=>{expect(matchesScan(A,{kind:'plate',value:'d ab-1234'})).toBe(true);expect(matchesScan(A,{kind:'qr',value:'#bkybr'})).toBe(true);expect(matchesScan(C,{kind:'qr',value:'al-1'})).toBe(true);expect(matchesScan(A,{kind:'plate',value:''})).toBe(false);expect(matchesScan(A,{kind:'qr',value:'BK'})).toBe(false)});
 it('single, ambiguous, outside with explicit jump, unknown',()=>{
  expect(resolveScan({kind:'qr',value:'BKYBR'},[A,C],[A,B,C]).status).toBe('single');
  const amb=resolveScan({kind:'plate',value:'DAB1234'},[A,B],[A,B,C]);expect(amb.status).toBe('ambiguous');
  const out=resolveScan({kind:'qr',value:'ZZZ99'},[A],[A,C],()=>'2026-10-20');expect(out).toMatchObject({status:'outside',jumpDate:'2026-10-20'});
  expect(resolveScan({kind:'plate',value:'DAB1234'},[C],[A,B,C],()=>'2026-10-20')).toMatchObject({status:'outside',jumpDate:null});
  expect(resolveScan({kind:'qr',value:'NOPE1'},[A],[A]).status).toBe('unknown');
 });
 it('dedupes duplicate visible rows (in+out events)',()=>{expect(resolveScan({kind:'qr',value:'BKYBR'},[A,A],[A]).status).toBe('single')});
});

import {scanAfterJump} from './scan-lookup';
it('post-jump visibility distinguishes a visible row from a still-filtered booking',()=>{
 const booking={...blank(),id:'jump-target',code:'TARGET'};
 expect(scanAfterJump(booking,[booking])).toBeNull();
 expect(scanAfterJump(booking,[])).toEqual({status:'outside',bookings:[booking],jumpDate:null,filteredAfterJump:true,blocking:[]});
});

it('scanAfterJump carries named blocking filters',()=>{
 const booking={...blank(),id:'jump-target',code:'TARGET'};
 expect(scanAfterJump(booking,[],['noshow'])).toEqual({status:'outside',bookings:[booking],jumpDate:null,filteredAfterJump:true,blocking:['noshow']});
});
