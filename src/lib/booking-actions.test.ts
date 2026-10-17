import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../api',()=>({db:{rpc:mock.rpc}}));
import {blank} from '../model';
import {changeBookingSpot,transitionBookingStatus,loadBookingLocationHistory,loadBookingCallHistory} from './booking-actions';
const requestId='22222222-2222-4222-8222-222222222222';
const booking={...blank(),spot:'A1',lifecycle_revision:3,detail_revision:2};
beforeEach(()=>{vi.clearAllMocks();mock.rpc.mockResolvedValue({data:booking,error:null});});
describe('audited booking detail actions',()=>{
 it('sends only action identity and expected state, no actor or server clock',async()=>{
  await transitionBookingStatus({booking,requestId,status:'no_show'});
  expect(mock.rpc).toHaveBeenCalledWith('apply_booking_detail_action',{
   p_request_id:requestId,p_booking_id:booking.id,p_action:'status',p_target:'no_show',
   p_expected:{status:'confirmed',checked_in_at:null,checked_out_at:null,spot:'A1',lifecycle_revision:3,detail_revision:2}
  });
 });
 it('supports cancellation without clearing historical fields',async()=>{
  await transitionBookingStatus({booking,requestId,status:'cancelled'});
  expect(mock.rpc.mock.calls[0][1].p_target).toBe('cancelled');
 });
 it.each(['no_show','cancelled'] as const)('rejects %s when checked in or out',async status=>{
  for(const row of [{...booking,checked_in_at:'2026-10-17T12:00:00Z'},{...booking,checked_out_at:'2026-10-17T13:00:00Z'}])
   await expect(transitionBookingStatus({booking:row,requestId,status})).rejects.toThrow('rückgängig');
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('trims a real free-text spot but sends no fake product or location choice',async()=>{
  await changeBookingSpot({booking,requestId,spot:' Halle B / 42 '});
  expect(mock.rpc.mock.calls[0][1].p_target).toBe('Halle B / 42');
  expect(mock.rpc.mock.calls[0][1].p_action).toBe('spot');
 });
 it.each(['',' ','x'.repeat(101)])('rejects invalid spot %s',async spot=>{
  await expect(changeBookingSpot({booking,requestId,spot})).rejects.toThrow('1 bis 100');
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('rejects unchanged spot and closed bookings',async()=>{
  await expect(changeBookingSpot({booking,requestId,spot:'A1'})).rejects.toThrow('unverändert');
  await expect(changeBookingSpot({booking:{...booking,checked_out_at:'2026-10-17T12:00:00Z'},requestId,spot:'A2'})).rejects.toThrow('offene');
 });
 it('rejects invalid request identity and lifecycle revision',async()=>{
  await expect(changeBookingSpot({booking,requestId:'bad',spot:'A2'})).rejects.toThrow('Ungültige');
  await expect(changeBookingSpot({booking:{...booking,lifecycle_revision:-1},requestId,spot:'A2'})).rejects.toThrow('Buchungsstand');
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('rejects absent lifecycle or detail snapshot rather than assuming zero',async()=>{
  for(const row of [{...booking,lifecycle_revision:undefined},{...booking,detail_revision:undefined}]){
   await expect(changeBookingSpot({booking:row,requestId,spot:'A2'})).rejects.toThrow('neu laden');
  }
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('uses exact original request context for retry',async()=>{
  mock.rpc.mockResolvedValueOnce({error:{message:'network'}}).mockResolvedValueOnce({data:booking});
  await expect(changeBookingSpot({booking,requestId,spot:'A2'})).rejects.toThrow('network');
  await changeBookingSpot({booking,requestId,spot:'A2'});
  expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
 });
 it('reports concurrency and forbidden actions without false success',async()=>{
  mock.rpc.mockResolvedValueOnce({error:{code:'40001'}}).mockResolvedValueOnce({error:{code:'42501'}});
  await expect(changeBookingSpot({booking,requestId,spot:'A2'})).rejects.toThrow('inzwischen');
  await expect(changeBookingSpot({booking,requestId,spot:'A2'})).rejects.toThrow('Berechtigung');
 });
 it('requires actual matching server confirmation',async()=>{
  for(const data of [null,{id:'different'}]){
   mock.rpc.mockResolvedValue({data,error:null});
   await expect(changeBookingSpot({booking,requestId,spot:'A2'})).rejects.toThrow('Keine Bestätigung');
  }
 });
 it('normalizes nullable text and retains lifecycle revision',async()=>{
  mock.rpc.mockResolvedValue({data:{...booking,phone:null,spot:null},error:null});
  expect(await changeBookingSpot({booking,requestId,spot:'A2'})).toMatchObject({phone:'',spot:'',lifecycle_revision:3,detail_revision:2});
 });
 it('returns server detail revision, never stale submitted revision',async()=>{
  mock.rpc.mockResolvedValue({data:{...booking,detail_revision:9},error:null});
  expect(await changeBookingSpot({booking,requestId,spot:'A2'})).toMatchObject({detail_revision:9});
 });
 it('loads real location and call histories and returns empty honestly',async()=>{
  mock.rpc.mockResolvedValue({data:[],error:null});
  expect(await loadBookingLocationHistory(booking.id)).toEqual([]);
  expect(await loadBookingCallHistory(booking.id)).toEqual([]);
  expect(mock.rpc.mock.calls).toEqual([
   ['booking_location_history',{p_booking_id:booking.id}],
   ['booking_call_history',{p_booking_id:booking.id}]
  ]);
 });
 it('does not turn errors or missing backend histories into empty results',async()=>{
  mock.rpc.mockResolvedValueOnce({data:null,error:{message:'offline'}}).mockResolvedValueOnce({data:null,error:null});
  await expect(loadBookingLocationHistory(booking.id)).rejects.toThrow('offline');
  await expect(loadBookingCallHistory(booking.id)).rejects.toThrow('nicht geladen');
 });
});
