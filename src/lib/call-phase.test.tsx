import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {callPhaseOf,callFor,returnNeedsCall} from './call-phase';
import {BookingDetailView,ReturnCallDone} from './booking-detail-view';
import {blank} from '../model';

const CI='2026-10-24T08:00:00Z';
describe('per-direction customer call (arrival vs return)',()=>{
 it('call before check-in is the arrival call, at/after check-in the return call',()=>{
  expect(callPhaseOf(null,CI)).toBeNull();
  expect(callPhaseOf('nope',CI)).toBeNull();
  expect(callPhaseOf('2026-10-24T07:00:00Z',null)).toBe('in');
  expect(callPhaseOf('2026-10-24T07:00:00Z',CI)).toBe('in');
  expect(callPhaseOf(CI,CI)).toBe('out');
  expect(callPhaseOf('2026-10-24T12:00:00Z',CI)).toBe('out');
 });
 it('a call on one side never marks the other side',()=>{
  const arrival='2026-10-24T07:00:00Z',ret='2026-10-24T12:00:00Z';
  expect(callFor('in',arrival,CI)).toBe(arrival);expect(callFor('out',arrival,CI)).toBeNull();
  expect(callFor('out',ret,CI)).toBe(ret);expect(callFor('in',ret,CI)).toBeNull();
  expect(callFor('in',arrival,null)).toBe(arrival);expect(callFor('out',arrival,null)).toBeNull();
 });
 it('return side needs the call first unless already picked up / checked out',()=>{
  expect(returnNeedsCall({})).toBe(true);
  expect(returnNeedsCall({returnCalledAt:'x'})).toBe(false);
  expect(returnNeedsCall({takenAwayAt:'x'})).toBe(false);
  expect(returnNeedsCall({retrievedAt:'x'})).toBe(false);
  expect(returnNeedsCall({checkedOutAt:'x'})).toBe(false);
 });
});

const base={...blank(),code:'AF-1',customer_name:'X',plate:'P1',total:0,paid:0,status:'confirmed' as const,arrival_at:'2026-10-18T07:10:00Z',departure_at:'2026-10-24T12:45:00Z',checked_in_at:'2026-10-18T08:59:00Z'};
const props=(x:any={})=>({booking:base,known:true,flightIn:<i/>,flightOut:<i/>,onBack:()=>{},onEdit:()=>{},onStartCheck:()=>{},onAction:()=>{},calledSlot:<b className="cin"/>,calledOutSlot:<b className="cout">Has called</b>,...x});
const outPanel=(h:string)=>h.slice(h.indexOf('flight-panel out'),h.indexOf('pp-called'));
describe('detail return panel: "Hat angerufen" first, then "Markiere als abgeholt"',()=>{
 it('not yet called: only the call button in the red panel',()=>{
  const o=outPanel(r(<BookingDetailView {...props()}/>));
  expect(o).toContain('cout');expect(o).not.toContain('Mark as taken away');expect(o).not.toContain('Mark as retrieved');
 });
 it('return call recorded (e.g. from the list): pick-up action shown with existing behaviour',()=>{
  const o=outPanel(r(<BookingDetailView {...props({returnCalledAt:'2026-10-24T12:00:00Z'})}/>));
  expect(o).toContain('Mark as taken away');expect(o).not.toContain('Mark as retrieved');expect(o.indexOf('cout')).toBeLessThan(o.indexOf('Mark as taken away'));
 });
 it('recorded return call shows time and caller on one legible line, styled like the call button',()=>{
  const h=r(<ReturnCallDone time="15:18" by="Alaa" onClick={()=>{}}/>);
  expect(h).toContain('op-btn out fp-call-done');expect(h).toMatch(/<span class="fp-call-done-label">Has called <time>15:18<\/time><\/span><\/span><span class="fp-call-done-by"><span class="fp-call-done-sep" aria-hidden="true"> · <\/span>von <bdi>Alaa<\/bdi><\/span>/);expect(h).toContain('aria-label="Kunde angerufen 15:18 · von Alaa"');
  expect(h).not.toContain('op-by');
  expect(r(<ReturnCallDone time="15:18" onClick={()=>{}}/>)).not.toContain('fp-call-done-by');
  const m=readFileSync('src/main.tsx','utf8');expect(m).toContain('<ReturnCallDone time={callCounter({calledAt:own}).time} by={actors.call_out}');expect(m).not.toContain('fp-call-hint');
 });
 it('already taken away without a call keeps showing its stamped state',()=>{
  const ops={booking_id:'x',taken_away_at:'2026-10-24T12:10:00Z',retrieved_at:null,customer_called_at:null,ride_started_at:null,performed_by:'',updated_at:''};
  expect(outPanel(r(<BookingDetailView {...props({ops})}/>))).toMatch(/Mark as taken away<\/span><small class="op-at">/);
 });
 it('arrival panel and driver button unchanged',()=>{
  const h=r(<BookingDetailView {...props()}/>);const i=h.slice(h.indexOf('flight-panel in'),h.indexOf('flight-panel out'));
  expect(i).toContain('cin');expect(i).toContain('Not assigned to driver');
 });
 it('list rows and detail derive the call side the same way',()=>{
  const m=readFileSync('src/main.tsx','utf8');
  expect(m).toMatch(/callCounterSlot=\{callFor\(kind,/);
  expect(m).toMatch(/callPhaseOf\(ops\[b\.id\]\?\.customer_called_at,b\.checked_in_at\)===kind/);
  expect(m).toContain("callPhase=(ph:'in'|'out')=>callFor(ph,cAt,selected.checked_in_at)");
  expect(m).toContain("returnCalledAt={callPhase('out')}");
 });
});
