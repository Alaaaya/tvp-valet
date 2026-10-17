import React from 'react';
import {renderToStaticMarkup as render} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {CallCounter} from './call-counter';
import {BookingListRow} from './booking-list-row';
import {BookingDetailView} from './booking-detail-view';
import {blank} from '../model';

const calledAt='2026-10-17T15:00:00Z',stamp='2026-10-17T15:05:00Z';
const base={...blank(),code:'CALL-DISPLAY',plate:'D TEST 1'};
const states=[
 {name:'called open',checked_in_at:null,checked_out_at:null,visible:true},
 {name:'checked in with return still open',checked_in_at:stamp,checked_out_at:null,visible:false},
 {name:'checkout only',checked_in_at:null,checked_out_at:stamp,visible:false},
 {name:'both handed over',checked_in_at:stamp,checked_out_at:stamp,visible:false},
 {name:'checkout undone while checkin retained',checked_in_at:stamp,checked_out_at:null,visible:false},
 {name:'checkin undone but checkout retained',checked_in_at:null,checked_out_at:stamp,visible:false},
 {name:'all handovers undone',checked_in_at:null,checked_out_at:null,visible:true}
];
describe('current handover state controls call counter display only',()=>{
 for(const surface of ['row','detail'] as const)for(const state of states)it(surface+' '+state.name,()=>{
  const booking=Object.freeze({...base,checked_in_at:state.checked_in_at,checked_out_at:state.checked_out_at});
  const operations=Object.freeze({customer_called_at:calledAt});
  const before=JSON.stringify({booking,operations});
  const counter=<CallCounter compact={surface==='row'} calledAt={operations.customer_called_at} checkedInAt={booking.checked_in_at} checkedOutAt={booking.checked_out_at} now={Date.parse(calledAt)+600000}/>;
  const html=surface==='row'
   ?render(<BookingListRow b={booking} kind="out" time="17:05" completed={false} onOpen={()=>{}} callCounterSlot={counter}/>)
   :render(<BookingDetailView booking={booking} flightIn={null} flightOut={null} known={true} onBack={()=>{}} onEdit={()=>{}} onStartCheck={()=>{}} onAction={()=>{}} calledSlot={counter}/>);
  expect(html.includes('seit 10 Min')).toBe(state.visible);
  expect(html.includes('cc-dur')).toBe(state.visible);
  expect(html).not.toContain('Anruf→Übergabe');
  expect(JSON.stringify({booking,operations})).toBe(before);
 });
 it('both production call sites supply the actual checkin and checkout fields',()=>{
  const source=readFileSync('src/main.tsx','utf8');
  expect(source).toContain('checkedInAt={b.checked_in_at} checkedOutAt={b.checked_out_at}');
  expect(source).toContain('checkedInAt={selected.checked_in_at} checkedOutAt={selected.checked_out_at}');
 });
});
