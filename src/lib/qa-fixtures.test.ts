import {describe,it,expect} from 'vitest';
import {blank,utc} from '../model';
import {occupancyAnalytics} from './occupancy-analytics';
import {employeeCashTotals} from './booking-payments';
import {QA_FIXTURE_IDS,withoutQaFixtures} from './qa-fixtures';
const now=new Date('2026-10-17T12:00:00Z');
const mk=(id:string,extra:object={})=>({...blank(),id,arrival_at:utc('2026-10-17T08:00'),departure_at:utc('2026-10-18T09:00'),...extra});
describe('QA fixtures excluded from metrics',()=>{
 it('occupancy ignores fixtures, incl cancelled/confirmed, keeps lookalikes',()=>{
  const rows=[mk(QA_FIXTURE_IDS[0]),mk(QA_FIXTURE_IDS[1],{status:'cancelled'}),mk('real-1',{customer_name:'Test Testmann',code:'TEST-1'})];
  expect(occupancyAnalytics(rows,'2026-10-17',1,now).days[0].maximum).toBe(1);
 });
 it('cash excludes fixture bookings and ledger, keeps similar names',()=>{
  const b=(id:string)=>mk(id,{key_cash:'10€ Wael',customer_name:'QA Test'});
  const r=employeeCashTotals([b(QA_FIXTURE_IDS[0]),b(QA_FIXTURE_IDS[1]),b('real-1')],[]);
  expect(r.previewTotalCents).toBe(1000);
  expect(withoutQaFixtures([b('x')]).length).toBe(1);
 });
});
import {readFileSync} from 'node:fs';
describe('app-level exclusion wiring',()=>{
 const m=readFileSync(new URL('../main.tsx',import.meta.url),'utf8');
 it('filters every API load and import before setRows',()=>{
  expect(m).toContain('setRows(withoutQaFixtures(d.rows))');
  expect(m).toContain('setRows(withoutQaFixtures(next))');
 });
 it('labels analytics',()=>{
  expect(readFileSync(new URL('./analytics-view.tsx',import.meta.url),'utf8')).toContain('QA-Testbuchungen sind ausgeschlossen');
 });
});
