import {describe,it,expect} from 'vitest';
import {blank} from '../model';
import {bookingWritePayload} from './booking-payload';
describe('booking write boundary',()=>{
 it('never spreads unused nullable columns or merged operation metadata into booking upserts',()=>{
  const original=blank();
  const payload=bookingWritePayload({...original,taken_away_at:null,customer_called_at:null,ride_started_at:null,performed_by:'spoof',updated_at:'yesterday',booking_id:'other',operation_events:[]} as typeof original);
  expect(Object.keys(payload).sort()).toEqual(Object.keys(original).sort());
  for(const field of ['taken_away_at','customer_called_at','ride_started_at','performed_by','updated_at','booking_id','operation_events'])expect(payload).not.toHaveProperty(field);
  expect(payload.id).toBe(original.id);
 });
 it('preserves original fields and nullable reference normalization',()=>{
  const original=blank();original.customer_name='Disposable';original.external_id='';original.product='';
  expect(bookingWritePayload(original)).toEqual({...original,external_id:null,product:null});
 });
});

describe('optional native booking details',()=>{
 it('never infers or splits names from the legacy full name',()=>{
  const original={...blank(),customer_name:'Dr. Ada van Example'};
  const payload=bookingWritePayload(original);
  expect(payload.customer_name).toBe('Dr. Ada van Example');
  for(const key of ['first_name','last_name','car_description'])expect(payload).not.toHaveProperty(key);
 });
 it('sends explicitly supplied optional fields unchanged for admin payload',()=>{
  const original={...blank(),customer_name:'Original partner name',first_name:'Ada',last_name:'van Example',car_description:'Blue estate'};
  expect(bookingWritePayload(original)).toMatchObject({customer_name:'Original partner name',first_name:'Ada',last_name:'van Example',car_description:'Blue estate'});
 });
 it('retains explicit null clears but omits undefined fields',()=>{
  const original={...blank(),first_name:null,last_name:undefined,car_description:''};
  const payload=bookingWritePayload(original);
  expect(payload).toMatchObject({first_name:null,car_description:''});
  expect(payload).not.toHaveProperty('last_name');
 });
});
