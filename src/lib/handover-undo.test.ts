import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn(),revision:vi.fn()}));
vi.mock('../api',()=>({db:{rpc:mock.rpc,from:()=>({select:()=>({eq:()=>({single:mock.revision})})})}}));
import {blank} from '../model';
import {canUndoHandover,undoHandover} from './handover-undo';
const requestId='22222222-2222-4222-8222-222222222222';
const booking={...blank(),checked_in_at:'2026-10-17T12:00:00Z',checked_out_at:null};
beforeEach(()=>{vi.clearAllMocks();mock.revision.mockResolvedValue({data:{...booking,checked_in_at:null,booking_handover_undos:[{count:1}]},error:null});mock.rpc.mockResolvedValue({data:{...booking,checked_in_at:null},error:null})});
describe('undo lifecycle and server contract',()=>{
 it('only permits completed confirmed actions in valid order',()=>{
  expect(canUndoHandover(booking,'in')).toBe(true);
  expect(canUndoHandover(booking,'out')).toBe(false);
  expect(canUndoHandover({...booking,checked_out_at:'2026-10-17T13:00:00Z'},'in')).toBe(false);
  expect(canUndoHandover({...booking,checked_out_at:'2026-10-17T13:00:00Z'},'out')).toBe(true);
  expect(canUndoHandover({...booking,status:'cancelled'},'in')).toBe(false);
  expect(canUndoHandover({...booking,checked_in_at:null},'in')).toBe(false);
 });
 it('sends stable request and expected state, no spoofable actor or clock',async()=>{
  await undoHandover({requestId,booking,action:'in'});
  expect(mock.rpc).toHaveBeenCalledWith('undo_booking_handover',{p_request_id:requestId,p_booking_id:booking.id,p_action:'in',p_expected_at:booking.checked_in_at});
 });
 it('undo checkout targets checkout time',async()=>{
  const row={...booking,checked_out_at:'2026-10-17T13:00:00Z'};
  await undoHandover({requestId,booking:row,action:'out'});
  expect(mock.rpc.mock.calls[0][1].p_expected_at).toBe(row.checked_out_at);
 });
 it('retains request ID on retries after an ambiguous response',async()=>{
  mock.rpc.mockResolvedValueOnce({error:{message:'Network error'}}).mockResolvedValueOnce({data:booking});
  await expect(undoHandover({requestId,booking,action:'in'})).rejects.toThrow('Network error');
  await undoHandover({requestId,booking,action:'in'});
  expect(mock.rpc.mock.calls[0][1]).toEqual(mock.rpc.mock.calls[1][1]);
 });
 it('does not claim success without confirmation',async()=>{
  mock.rpc.mockResolvedValue({data:null,error:null});
  await expect(undoHandover({requestId,booking,action:'in'})).rejects.toThrow('Keine Bestätigung');
 });
 it('surfaces concurrent changes without overwriting',async()=>{
  mock.rpc.mockResolvedValue({error:{code:'40001',message:'stale'}});
  await expect(undoHandover({requestId,booking,action:'in'})).rejects.toThrow('inzwischen geändert');
 });
 it('refuses undo checkin while checkout exists',async()=>{
  await expect(undoHandover({requestId,booking:{...booking,checked_out_at:'2026-10-17T13:00:00Z'},action:'in'})).rejects.toThrow('zuerst');
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('refuses invalid IDs before transport',async()=>{
  await expect(undoHandover({requestId:'bad',booking,action:'in'})).rejects.toThrow('Ungültige');
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('returns the monotonic undo receipt revision',async()=>{mock.revision.mockResolvedValue({data:{...booking,booking_handover_undos:[{count:9}]},error:null});expect(await undoHandover({requestId,booking,action:'in'})).toHaveProperty('lifecycle_revision',9)});
 it('normalizes nullable booking fields',async()=>{
  mock.revision.mockResolvedValue({data:{...booking,phone:null,external_id:null,comment:null,booking_handover_undos:[{count:1}]}});
  expect(await undoHandover({requestId,booking,action:'in'})).toMatchObject({phone:'',external_id:'',comment:''});
 });
});
