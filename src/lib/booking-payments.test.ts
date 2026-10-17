import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('../api',()=>({db:mock}));
import {blank} from '../model';
import {employeeCashTotals,hasLegacyCashConflict,loadBookingPayments,outstandingCents,recordBookingPayment,type BookingPayment} from './booking-payments';
const requestId='22222222-2222-4222-8222-222222222222';
const booking={...blank(),total:100.25,paid:10.10};
const receipt:BookingPayment={
 id:requestId,booking_id:booking.id,actor_id:'actor',actor_name:'Server Name',method:'cash',
 amount_cents:1000,expected_paid_cents:1010,expected_total_cents:10025,paid_after_cents:2010,
 legacy_key_snapshot:null,occurred_at:'2026-10-17T12:00:00Z',transaction_id:1
};
beforeEach(()=>{vi.clearAllMocks();mock.rpc.mockResolvedValue({data:receipt,error:null});});
describe('atomic payments client',()=>{
 it('sends integer cents and snapshot, never a client actor/time',async()=>{
  expect(await recordBookingPayment({booking,requestId,amountCents:1000,method:'cash'})).toEqual(receipt);
  expect(mock.rpc).toHaveBeenCalledWith('record_booking_payment',{
   p_request_id:requestId,p_booking_id:booking.id,p_amount_cents:1000,p_method:'cash',
   p_expected_paid_cents:1010,p_expected_total_cents:10025
  });
 });
 it.each(['cash','card','bank_transfer'] as const)('supports explicit %s',async method=>{
  mock.rpc.mockResolvedValue({data:{...receipt,method},error:null});
  await recordBookingPayment({booking,requestId,amountCents:1000,method});
 });
 it.each([0,-1,1.01,NaN,Infinity,Number.MAX_SAFE_INTEGER])('rejects bad cents %s',async amountCents=>{
  await expect(recordBookingPayment({booking,requestId,amountCents,method:'cash'})).rejects.toThrow();
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('rejects overpayment, bad UUID and nonconfirmed booking',async()=>{
  await expect(recordBookingPayment({booking,requestId,amountCents:9016,method:'cash'})).rejects.toThrow('Restbetrag');
  await expect(recordBookingPayment({booking,requestId:'oops',amountCents:1,method:'cash'})).rejects.toThrow('ID');
  await expect(recordBookingPayment({booking:{...booking,status:'cancelled'},requestId,amountCents:1,method:'cash'})).rejects.toThrow('bestätigt');
 });
 it('converts full NUMERIC(12,2) range without binary cent tolerance errors',()=>{
  expect(outstandingCents({total:9999999999.97,paid:0})).toBe(999999999997);
  expect(outstandingCents({total:9999999999.99,paid:0})).toBe(999999999999);
  expect(outstandingCents({total:0.29,paid:0})).toBe(29);
  expect(()=>outstandingCents({total:10000000000,paid:0})).toThrow();
  expect(()=>outstandingCents({total:1.001,paid:0})).toThrow();
 });
 it('never presents offset-loaded inputs as a consistent authoritative sum',()=>{
  const report=employeeCashTotals([booking],[receipt]);
  expect(report.totalCents).toBeNull();expect(report.previewTotalCents).toBe(1000);
  expect(report.snapshotConsistent).toBe(false);expect(report.label).toContain('Vorschau');
 });
 it('does not infer payment from a provider or total',()=>{
  expect(outstandingCents(booking)).toBe(9015);
  expect(outstandingCents({...booking,paid:110})).toBe(0);
  expect(()=>outstandingCents({...booking,paid:1.001})).toThrow('Cent');
 });
 it('blocks ambiguous legacy cash but allows noncash',async()=>{
  const legacy={...booking,key_cash:'10€ Wael'};
  expect(hasLegacyCashConflict(legacy)).toBe(true);
  await expect(recordBookingPayment({booking:legacy,requestId,amountCents:1000,method:'cash'})).rejects.toThrow('geklärt');
  mock.rpc.mockResolvedValue({data:{...receipt,method:'card'},error:null});
  await recordBookingPayment({booking:legacy,requestId,amountCents:1000,method:'card'});
 });
 it.each(['PT409','40001'])('retains exact request context on retry and reports stale state %s',async code=>{
  const input={booking,requestId,amountCents:1000,method:'cash' as const};
  mock.rpc.mockResolvedValueOnce({error:{code}});
  await expect(recordBookingPayment(input)).rejects.toThrow('neu laden');
  await recordBookingPayment(input);
  expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
 });
 it('rejects missing or context-mismatched confirmation',async()=>{
  mock.rpc.mockResolvedValue({data:{...receipt,id:'wrong'}});
  await expect(recordBookingPayment({booking,requestId,amountCents:1000,method:'cash'})).rejects.toThrow('bestätigung');
 });
 it('paginates read-only ledger instead of truncating to 1000',async()=>{
  const range=vi.fn().mockResolvedValueOnce({data:Array(1000).fill(receipt)}).mockResolvedValueOnce({data:[receipt]});
  const query={select:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),range};
  mock.from.mockReturnValue(query);
  expect(await loadBookingPayments(booking.id)).toHaveLength(1001);
  expect(query.eq).toHaveBeenCalledWith('booking_id',booking.id);
  expect(range.mock.calls).toEqual([[0,999],[1000,1999]]);
 });
});
describe('truthful employee cash projection',()=>{
 it('uses server actor, separates legacy identity and ignores card/provider/paid',()=>{
  const legacy={...blank(),key_cash:'30€ okAlaa'};
  const report=employeeCashTotals([booking,legacy],[receipt,{...receipt,id:'card',method:'card',amount_cents:9000}]);
  expect(report.previewTotalCents).toBe(4000);
  expect(report.totals).toEqual([
   {employeeId:'actor',employeeName:'Server Name',source:'ledger',cashCents:1000},
   {employeeId:'legacy:alaa',employeeName:'Alaa',source:'legacy',cashCents:3000}
  ]);
 });
 it('deduplicates rows and receipts, scopes all amounts to selected bookings',()=>{
  expect(employeeCashTotals([booking,booking],[receipt,receipt,{...receipt,id:'other',booking_id:'other'}]).previewTotalCents).toBe(1000);
 });
 it('defaults unnamed historical cash to Wael without matching a server identity',()=>{
  expect(employeeCashTotals([{...booking,key_cash:'10€'}],[]).totals[0]).toEqual({
   employeeId:'legacy:wael',employeeName:'Wael',source:'legacy',cashCents:1000
  });
 });
 it('never adds legacy and ledger cash on same booking',()=>{
  const report=employeeCashTotals([{...booking,key_cash:'10€ Wael'}],[receipt]);
  expect(report.totalCents).toBeNull();expect(report.conflictBookingIds).toEqual([booking.id]);
  expect(report.totals).toHaveLength(1);
 });
 it('flags uncertain numeric notes instead of claiming a total',()=>{
  const report=employeeCashTotals([{...booking,key_cash:'10€ Wael + 20€ Alaa'}],[]);
  expect(report.totalCents).toBeNull();expect(report.unparsedBookingIds).toEqual([booking.id]);
 });
 it('does not count received paid or a price as cash',()=>{
  expect(employeeCashTotals([{...booking,paid:100,total:100}],[]).previewTotalCents).toBe(0);
 });
});
