import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../api',()=>({db:{rpc:mock.rpc}}));
import {blank} from '../model';
import {recordCustomerCall} from './customer-calls';
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
it.each(['40001','42501'])('shows actionable server rejection %s',async code=>{
 mock.rpc.mockResolvedValue({error:{code}});
 await expect(recordCustomerCall({booking,requestId})).rejects.toThrow(code==='40001'?'neu laden':'Berechtigung');
});
it('rejects malformed server confirmation',async()=>{
 for(const data of [null,{...receipt,receipt_id:'other'},{...receipt,lifecycle_revision:-1},{...receipt,occurred_at:'bad'}]){
 mock.rpc.mockResolvedValue({data});
 await expect(recordCustomerCall({booking,requestId})).rejects.toThrow('Bestätigung');
 }
});
