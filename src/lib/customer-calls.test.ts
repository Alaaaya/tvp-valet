import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../api',()=>({db:{rpc:mock.rpc}}));
import {blank} from '../model';
import {recordCustomerCall,type CustomerCallBooking} from './customer-calls';
const requestId='22222222-2222-4222-8222-222222222222';
const booking={...blank(),customer_called_at:null,lifecycle_revision:0};
const receipt={receipt_id:requestId,occurred_at:'2026-10-17T13:00:00Z',customer_called_at:'2026-10-17T13:00:00Z',lifecycle_revision:0};
beforeEach(()=>{mock.rpc.mockReset();mock.rpc.mockResolvedValue({data:receipt});});
it('sends exact nullable snapshot, never actor or clock',async()=>{
 expect(await recordCustomerCall({booking,requestId})).toEqual(receipt);
 expect(mock.rpc).toHaveBeenCalledWith('record_booking_customer_call',{
 p_request_id:requestId,p_booking_id:booking.id,p_expected_called_at:null,
 p_expected_checked_out_at:null,p_expected_lifecycle_revision:0,p_allow_repeat:false});
});
it('requires explicit confirmation on repeat',async()=>{
 const called={...booking,customer_called_at:receipt.customer_called_at};
 await expect(recordCustomerCall({booking:called,requestId})).rejects.toThrow('bestätigen');
 expect(mock.rpc).not.toHaveBeenCalled();
 await recordCustomerCall({booking:called,requestId,allowRepeat:true});
 expect(mock.rpc.mock.calls[0][1].p_allow_repeat).toBe(true);
 expect(mock.rpc.mock.calls[0][1].p_expected_called_at).toBe(receipt.customer_called_at);
});
it('rejects closed and unconfirmed bookings',async()=>{
 for(const b of [{...booking,checked_out_at:receipt.occurred_at},{...booking,status:'cancelled' as const}])
 await expect(recordCustomerCall({booking:b,requestId})).rejects.toThrow('offene');
 expect(mock.rpc).not.toHaveBeenCalled();
});
it('rejects missing and invalid revisions or missing call snapshot',async()=>{
 for(const b of [{...booking,lifecycle_revision:undefined},{...booking,lifecycle_revision:-1},{...booking,customer_called_at:undefined}])
 await expect(recordCustomerCall({booking:b,requestId})).rejects.toThrow('neu laden');
 expect(mock.rpc).not.toHaveBeenCalled();
});
it('rejects malformed UUID',async()=>{
 await expect(recordCustomerCall({booking,requestId:'bad'})).rejects.toThrow('Anfrage');
 expect(mock.rpc).not.toHaveBeenCalled();
});
it('retries with identical actor-free request context',async()=>{
 mock.rpc.mockResolvedValueOnce({error:{message:'network'}}).mockResolvedValueOnce({data:receipt});
 await expect(recordCustomerCall({booking,requestId})).rejects.toThrow('network');
 await recordCustomerCall({booking,requestId});
 expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
});
it.each(['PT409','40001','42501'])('shows actionable server rejection %s',async code=>{
 mock.rpc.mockResolvedValue({error:{code}});
 await expect(recordCustomerCall({booking,requestId})).rejects.toThrow(code==='42501'?'Berechtigung':'neu laden');
});
it('rejects malformed server confirmation',async()=>{
 for(const data of [null,{...receipt,receipt_id:'other'},{...receipt,lifecycle_revision:-1},{...receipt,occurred_at:'bad'}]){
 mock.rpc.mockResolvedValue({data});
 await expect(recordCustomerCall({booking,requestId})).rejects.toThrow('Bestätigung');
 }
});

import {CustomerCallConflictError,removeCustomerCall} from './customer-calls';
const calledBooking={...booking,customer_called_at:receipt.customer_called_at};
it('clears only the exact current call with the four-argument owner RPC',async()=>{
 const removed={...receipt,customer_called_at:null};
 mock.rpc.mockResolvedValue({data:removed});
 expect(await removeCustomerCall({booking:calledBooking,requestId})).toEqual(removed);
 expect(mock.rpc).toHaveBeenCalledWith('clear_booking_customer_call',{
  p_request_id:requestId,p_booking_id:booking.id,p_expected_called_at:receipt.customer_called_at,
  p_expected_lifecycle_revision:0
 });
});
it('rejects checked-out bookings without making an RPC',async()=>{
 await expect(removeCustomerCall({booking:{...calledBooking,checked_out_at:receipt.occurred_at},requestId})).rejects.toThrow('offene');
 expect(mock.rpc).not.toHaveBeenCalled();
});
it('rejects absent current call, invalid timestamps and missing revision locally',async()=>{
 for(const b of [booking,{...calledBooking,customer_called_at:'bad'},{...calledBooking,checked_out_at:undefined},
  {...calledBooking,lifecycle_revision:undefined},{...calledBooking,lifecycle_revision:-1},{...calledBooking,lifecycle_revision:0.5},{...calledBooking,lifecycle_revision:Number.MAX_SAFE_INTEGER+1}]){
  await expect(removeCustomerCall({booking:b as CustomerCallBooking,requestId})).rejects.toThrow('neu laden');
 }
 expect(mock.rpc).not.toHaveBeenCalled();
});
it('requires valid request identity and confirmed booking for removal',async()=>{
 await expect(removeCustomerCall({booking:calledBooking,requestId:'bad'})).rejects.toThrow('Anfrage');
 await expect(removeCustomerCall({booking:{...calledBooking,status:'cancelled'},requestId})).rejects.toThrow();
 expect(mock.rpc).not.toHaveBeenCalled();
});
it.each(['PT409','40001'])('exports typed conflict for stale removal %s',async code=>{
 mock.rpc.mockResolvedValue({error:{code}});
 const error=await removeCustomerCall({booking:calledBooking,requestId}).catch(e=>e);
 expect(error).toBeInstanceOf(CustomerCallConflictError);expect(error.code).toBe('PT409');
});
it('keeps removal retry identity and accepts canonical newer call response',async()=>{
 mock.rpc.mockResolvedValueOnce({error:{message:'network'}}).mockResolvedValueOnce({data:receipt});
 await expect(removeCustomerCall({booking:calledBooking,requestId})).rejects.toThrow('network');
 expect(await removeCustomerCall({booking:calledBooking,requestId})).toEqual(receipt);
 expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
});
it('rejects malformed removal confirmation and unauthorized response',async()=>{
 for(const data of [null,{...receipt,receipt_id:'other'},{...receipt,customer_called_at:'bad'},{...receipt,lifecycle_revision:-1}]){
  mock.rpc.mockResolvedValue({data});
  await expect(removeCustomerCall({booking:calledBooking,requestId})).rejects.toThrow('Bestätigung');
 }
 mock.rpc.mockResolvedValue({error:{code:'42501'}});
 await expect(removeCustomerCall({booking:calledBooking,requestId})).rejects.toThrow('Berechtigung');
});
