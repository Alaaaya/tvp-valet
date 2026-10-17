import {describe,it,expect} from 'vitest';
import {blank} from '../model';
import {bookingWritePayload} from './booking-payload';
describe('booking write boundary',()=>{
 it('never spreads unused nullable columns or merged operation metadata into booking upserts',()=>{
  const original=blank();
  const payload=bookingWritePayload({...original,taken_away_at:null,customer_called_at:null,ride_started_at:null,performed_by:'spoof',updated_at:'yesterday',booking_id:'other',operation_events:[]} as typeof original);
  expect(Object.keys(payload).sort()).toEqual(Object.keys(original).filter(k=>!['checked_in_at','checked_out_at'].includes(k)).sort());
  for(const field of ['taken_away_at','customer_called_at','ride_started_at','performed_by','updated_at','booking_id','operation_events'])expect(payload).not.toHaveProperty(field);
  expect(payload.id).toBe(original.id);
 });
 it('preserves original fields and nullable reference normalization',()=>{
  const original=blank();original.customer_name='Disposable';original.external_id='';original.product='';
  const {checked_in_at,checked_out_at,...ordinary}=original;
  expect(bookingWritePayload(original)).toEqual({...ordinary,external_id:null,product:null});
 });
 it('ordinary edits never resurrect lifecycle timestamps from a stale detail snapshot',()=>{
  const original={...blank(),checked_in_at:'2026-10-17T12:00:00Z',checked_out_at:'2026-10-17T13:00:00Z'};
  const payload=bookingWritePayload(original);
  expect(payload).not.toHaveProperty('checked_in_at');
  expect(payload).not.toHaveProperty('checked_out_at');
 });
});
