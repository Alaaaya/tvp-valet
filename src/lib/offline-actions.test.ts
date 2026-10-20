import {beforeEach,describe,expect,it,vi} from 'vitest';
import {blank,type Booking} from '../model';
const runtime=vi.hoisted(()=>({enqueueOffline:vi.fn(),cachedOfflineBooking:vi.fn(),cachedOfflineOperations:vi.fn()}));
vi.mock('./offline-client',()=>runtime);
vi.mock('../api',()=>({db:null,saveBooking:vi.fn()}));
import {saveBooking} from '../api';
import {saveOfflineEdit,offlineChangeSpot,offlineTransitionStatus,offlineRecordPayment,offlineRecordCustomerCall,offlineClearCustomerCall,saveOfflineHandover,offlineUndoHandover,offlineRecordOperation,saveOfflineBooking} from './offline-actions';
const id='12345678-1234-4234-8234-123456789012';
let b:Booking;
beforeEach(()=>{
 vi.clearAllMocks();
 b={...blank(),id,sync_version:0,lifecycle_revision:0,detail_revision:0,edit_revision:0,plate:'D-AA 1',customer_name:'Test',total:40};
 runtime.enqueueOffline.mockImplementation(async x=>({booking:x.projected,operations:x.projectedOps,eventId:x.id}));
 runtime.cachedOfflineBooking.mockReturnValue(b);
 runtime.cachedOfflineOperations.mockReturnValue(undefined);
});
describe('durable adapters',()=>{
 it('projects whitelisted edits, preserves server fields and expected revisions',async()=>{
  const result=await saveOfflineEdit(b,{...b,plate:'D-BB 2',paid:40},id);
  expect(result.plate).toBe('D-BB 2');expect(result.paid).toBe(0);expect(result.offline_pending).toBe(true);
  expect(runtime.enqueueOffline.mock.calls[0][0]).toMatchObject({id,kind:'safe_edit',payload:{patch:{plate:'D-BB 2'},expected:{edit_revision:0,detail_revision:0,lifecycle_revision:0}}});
 });
 it('rejects invalid edits before persistence',async()=>{
  for(const edited of [{...b,persons:0},{...b,km:-1},{...b,plate:''},{...b,departure_at:'bad'},b])
   await expect(saveOfflineEdit(b,edited,id)).rejects.toThrow();
  expect(runtime.enqueueOffline).not.toHaveBeenCalled();
 });
 it('does not silently succeed without version capability',async()=>{
  await expect(offlineChangeSpot({booking:{...b,sync_version:undefined},spot:'2',requestId:id})).rejects.toThrow('Offline');
  expect(runtime.enqueueOffline).not.toHaveBeenCalled();
 });
 it('queues detail payload exactly without edit_revision',async()=>{
  await offlineChangeSpot({booking:b,spot:' 2 ',requestId:id});
  const x=runtime.enqueueOffline.mock.calls[0][0];
  expect(x.projected.spot).toBe('2');
  expect(Object.keys(x.payload.expected).sort()).toEqual(['checked_in_at','checked_out_at','detail_revision','lifecycle_revision','spot','status'].sort());
  await offlineTransitionStatus({booking:b,status:'no_show',requestId:id});
  expect(runtime.enqueueOffline.mock.calls[1][0].projected.status).toBe('no_show');
 });
 it('blocks completed lifecycle detail changes',async()=>{
  await expect(offlineTransitionStatus({booking:{...b,checked_in_at:'2026-01-01T00:00:00Z'},status:'cancelled',requestId:id})).rejects.toThrow();
  expect(runtime.enqueueOffline).not.toHaveBeenCalled();
 });
 it('payment is projected booking, not fabricated ledger receipt',async()=>{
  const result=await offlineRecordPayment({booking:b,requestId:id,amountCents:1234,method:'card'});
  expect(result.paid).toBe(12.34);expect(result.offline_pending).toBe(true);
  expect(runtime.enqueueOffline.mock.calls[0][0].payload).toEqual({amount_cents:1234,method:'card',expected_paid_cents:0,expected_total_cents:4000});
 });
 it('blocks overpayment, legacy cash and fractional cents',async()=>{
  for(const input of [{booking:b,amountCents:4001,method:'card'},{booking:{...b,key_cash:'10 Wael'},amountCents:10,method:'cash'},{booking:b,amountCents:1.1,method:'card'}] as const)
   await expect(offlineRecordPayment({...input,requestId:id})).rejects.toThrow();
  expect(runtime.enqueueOffline).not.toHaveBeenCalled();
 });
 it('awaits durability and propagates storage failures with no network fallback',async()=>{
  runtime.enqueueOffline.mockRejectedValue(new Error('quota'));
  await expect(offlineRecordPayment({booking:b,requestId:id,amountCents:10,method:'card'})).rejects.toThrow('quota');
  expect(saveBooking).not.toHaveBeenCalled();
 });
 it('call projection records and clears only explicit valid state',async()=>{
  const booking={...b,customer_called_at:null};
  const receipt=await offlineRecordCustomerCall({booking,requestId:id});
  expect(receipt.offline_pending).toBe(true);expect(runtime.enqueueOffline.mock.calls[0][0].projectedOps.customer_called_at).toBe(receipt.customer_called_at);
  await expect(offlineRecordCustomerCall({booking:{...booking,customer_called_at:receipt.customer_called_at},requestId:id})).rejects.toThrow();
  await offlineClearCustomerCall({booking:{...booking,customer_called_at:receipt.customer_called_at},requestId:id});
  expect(runtime.enqueueOffline.mock.calls[1][0]).toMatchObject({kind:'clear_customer_call',projected:{customer_called_at:null}});
 });
 it('persists media and metadata together with stable names, no upload',async()=>{
  const blob=new Blob(['image'],{type:'image/png'});
  const input={booking:b,requestId:id,action:'in' as const,details:{km:50,key_cash:'key',flight_number:'EW 1',comment:'note',poor_visibility:false},media:[{id,blob,kind:'photo' as const,mime_type:'image/png',captured_at:'2026-01-01T00:00:00Z',name:'a.png'}]};
  const result=await saveOfflineHandover(input);
  expect(result.checked_in_at).toBeTruthy();expect(result.comment).toBe('note');
  const x=runtime.enqueueOffline.mock.calls[0][0],path=id+'/'+id+'-'+id+'.png';
  expect(result.edit_revision).toBe(1);expect(x.blobs[id]).toBe(blob);expect(x.payload.media[0]).toMatchObject({path,size_bytes:5});
  await saveOfflineHandover(input);expect(runtime.enqueueOffline.mock.calls[1][0].payload).toEqual(x.payload);
 });
 it('rejects media and out without checkin before persistence',async()=>{
  const input={booking:b,requestId:id,action:'out' as const,details:{km:null,key_cash:'',flight_number:'',comment:'',poor_visibility:false},media:[]};
  await expect(saveOfflineHandover(input)).rejects.toThrow();
  await expect(saveOfflineHandover({...input,action:'in',media:[{id,blob:new Blob([],{type:'image/png'}),kind:'photo',mime_type:'image/png',captured_at:'bad',name:'a'}]})).rejects.toThrow();
  expect(runtime.enqueueOffline).not.toHaveBeenCalled();
 });
 it('undo reset clears all operations and increments lifecycle',async()=>{
  runtime.cachedOfflineOperations.mockReturnValue({booking_id:id,taken_away_at:'x',retrieved_at:'x',customer_called_at:'x',ride_started_at:'x',performed_by:'actor',updated_at:'x'});
  const result=await offlineUndoHandover({booking:{...b,checked_in_at:'2026-01-01T00:00:00Z'},requestId:id,action:'in'});
  expect(result.checked_in_at).toBeNull();expect(result.lifecycle_revision).toBe(1);
  expect(runtime.enqueueOffline.mock.calls[0][0].projectedOps.customer_called_at).toBeNull();
 });
 it('operations use cache and prohibit generic customer_called',async()=>{
  runtime.cachedOfflineBooking.mockReturnValue({...b,checked_in_at:'2026-01-01T00:00:00Z'});
  const result=await offlineRecordOperation(id,'retrieved');expect(result.retrieved_at).toBeTruthy();
  await expect(offlineRecordOperation(id,'customer_called')).rejects.toThrow();
  runtime.cachedOfflineBooking.mockReturnValue(undefined);
  await expect(offlineRecordOperation(id,'taken_away')).rejects.toThrow();
 });
 it('new bookings fail offline explicitly and preserve online api',async()=>{
  runtime.cachedOfflineBooking.mockReturnValue(undefined);
  vi.stubGlobal('navigator',{onLine:false});
  await expect(saveOfflineBooking(b,true)).rejects.toThrow('Internetverbindung');
  expect(saveBooking).not.toHaveBeenCalled();
  vi.stubGlobal('navigator',{onLine:true});
  await saveOfflineBooking(b,true);expect(saveBooking).toHaveBeenCalledWith(b,true);
  vi.unstubAllGlobals();
 });
 it('existing booking operational save queues allowlisted patch',async()=>{
  await saveOfflineBooking({...b,comment:'new',paid:40},true);
  expect(runtime.enqueueOffline.mock.calls[0][0]).toMatchObject({kind:'update_ops',payload:{patch:{comment:'new'}}});
  expect(runtime.enqueueOffline.mock.calls[0][0].projected.paid).toBe(0);expect(runtime.enqueueOffline.mock.calls[0][0].projected.edit_revision).toBe(1);
 });
});
