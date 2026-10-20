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

import {clearCustomerCall} from './customer-calls';
import {readFileSync} from 'node:fs';
const calledAt='2026-10-17T13:00:00.000Z';
const calledBooking={...booking,customer_called_at:calledAt};
const clearReceipt={receipt_id:requestId,occurred_at:'2026-10-17T13:05:00.000Z',customer_called_at:null,lifecycle_revision:0};
it('clear sends exact snapshot to clear_booking_customer_call',async()=>{
 mock.rpc.mockResolvedValue({data:clearReceipt});
 expect(await clearCustomerCall({booking:calledBooking,requestId})).toEqual(clearReceipt);
 expect(mock.rpc).toHaveBeenCalledWith('clear_booking_customer_call',{
  p_request_id:requestId,p_booking_id:booking.id,p_expected_called_at:calledAt,p_expected_lifecycle_revision:0});
});
it('clear refuses when nothing was recorded, invalid snapshot, closed booking, bad id',async()=>{
 await expect(clearCustomerCall({booking,requestId})).rejects.toThrow('Kein Anruf');
 for(const b of [{...calledBooking,lifecycle_revision:undefined},{...calledBooking,lifecycle_revision:-1},{...calledBooking,customer_called_at:undefined}])
  await expect(clearCustomerCall({booking:b,requestId})).rejects.toThrow('neu laden');
 for(const b of [{...calledBooking,checked_out_at:calledAt},{...calledBooking,status:'cancelled' as const}])
  await expect(clearCustomerCall({booking:b,requestId})).rejects.toThrow('offene');
 await expect(clearCustomerCall({booking:calledBooking,requestId:'bad'})).rejects.toThrow('Anfrage');
 expect(mock.rpc).not.toHaveBeenCalled();
});
it.each(['PT409','40001','42501'])('clear shows actionable server rejection %s',async code=>{
 mock.rpc.mockResolvedValue({error:{code}});
 await expect(clearCustomerCall({booking:calledBooking,requestId})).rejects.toThrow(code==='42501'?'Berechtigung':'neu laden');
});
it('clear rejects malformed server confirmation (must return null call time)',async()=>{
 for(const data of [null,{...clearReceipt,receipt_id:'other'},{...clearReceipt,customer_called_at:calledAt},{...clearReceipt,lifecycle_revision:-1},{...clearReceipt,occurred_at:'bad'}]){
  mock.rpc.mockResolvedValue({data});
  await expect(clearCustomerCall({booking:calledBooking,requestId})).rejects.toThrow('Bestätigung');
 }
});
it('clear retries with identical request context',async()=>{
 mock.rpc.mockResolvedValueOnce({error:{message:'network'}}).mockResolvedValueOnce({data:clearReceipt});
 await expect(clearCustomerCall({booking:calledBooking,requestId})).rejects.toThrow('network');
 await clearCustomerCall({booking:calledBooking,requestId});
 expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
});
it('repeat-call modal has a full-width third "Anruf löschen" button wired to clearCall (demo + live)',()=>{
 const m=readFileSync('src/main.tsx','utf8');
 const modal=m.slice(m.indexOf('className="call-confirm call-ask"'),m.indexOf('document.body)',m.indexOf('className="call-confirm call-ask"')));
 expect(modal).toContain('{tr("Abbrechen")}');expect(modal).toContain('{tr("Ja, erneut speichern")}');
 expect(modal).toContain('onClick={()=>void clearCall(selected)}');expect(modal).toContain('callMutation.stale?tr("Neu laden"):tr("Anruf löschen")');
 expect(modal.indexOf('Anruf löschen')).toBeLessThan(modal.indexOf('Ja, erneut speichern'));expect(modal.indexOf('Ja, erneut speichern')).toBeLessThan(modal.indexOf('Abbrechen'));
 const fn=m.slice(m.indexOf('async function clearCall('),m.indexOf('async function saveEdit('));
 expect(fn).toMatch(/if\(demo\)\{[^}]*customer_called_at:null/);
 expect(fn).toContain("await callMutation.run(callSnapshot.current||withCall(b),'clear')");
 const css=readFileSync('src/reference-polish.css','utf8');
 expect(css).toMatch(/\.call-ask button\.call-clear\{min-height:44px/);expect(css).toMatch(/\.call-ask button\.call-cancel\{grid-column:1\/-1\}/);
 const tj=JSON.parse(readFileSync('src/lib/translations.json','utf8'));
 for(const k of ['Anruf löschen','Anruf gelöscht','Anruf konnte nicht gelöscht werden','Kein Anruf zum Löschen vorhanden.','Demo: Anruf nur lokal gelöscht'])expect(tj[k]).toHaveLength(3);
});
