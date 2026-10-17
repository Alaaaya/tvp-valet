import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('../api',()=>({db:mocks}));
import {loadBookingOperations,recordBookingOperation} from './operations';
const row={booking_id:'booking-a',taken_away_at:null,customer_called_at:'2026-10-17T09:22:00Z',ride_started_at:null,performed_by:'actor-a',updated_at:'2026-10-17T09:22:00Z'};
beforeEach(()=>vi.resetAllMocks());
describe('operations isolated read and server RPC contract',()=>{
 it('loads missing rows as an empty set, not fabricated timestamps',async()=>{mocks.from.mockReturnValue({select:vi.fn().mockResolvedValue({data:[],error:null})});expect(await loadBookingOperations()).toEqual([]);expect(mocks.from).toHaveBeenCalledWith('booking_operations');expect(mocks.rpc).not.toHaveBeenCalled()});
 it.each(['taken_away','customer_called','ride_started'] as const)('passes only booking id and action for %s and returns single object',async action=>{mocks.rpc.mockResolvedValue({data:row,error:null});expect(await recordBookingOperation('booking-a',action)).toBe(row);expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('record_booking_operation',{p_booking_id:'booking-a',p_action:action});expect(mocks.from).not.toHaveBeenCalled()});
 it('propagates permission and precondition rejection without optimistic state',async()=>{const error={message:'check-in required',code:'23514'};mocks.rpc.mockResolvedValue({data:null,error});await expect(recordBookingOperation('booking-a','taken_away')).rejects.toBe(error)});
 it('propagates read errors',async()=>{const error={message:'not authorized'};mocks.from.mockReturnValue({select:vi.fn().mockResolvedValue({data:null,error})});await expect(loadBookingOperations()).rejects.toBe(error)});
});
