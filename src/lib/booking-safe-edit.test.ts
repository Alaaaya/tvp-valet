import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('../api',()=>({db:{rpc:mock.rpc}}));
import {blank} from '../model';import {saveEditedBooking} from './booking-safe-edit';
const request='11111111-1111-4111-8111-111111111111';
const original={...blank(),customer_name:'Legacy Name',plate:'D-X 1',edit_revision:0,lifecycle_revision:0,detail_revision:0};
beforeEach(()=>{vi.clearAllMocks();mock.rpc.mockResolvedValue({data:{...original,edit_revision:1}})});
it('only sends actual editable differences and server expected snapshot',async()=>{
 await saveEditedBooking(original,{...original,phone:'123',total:0,paid:0,status:'cancelled',spot:'stale',checked_in_at:'2000-01-01T00:00:00Z'},request);
 expect(mock.rpc.mock.calls[0]).toEqual(['apply_booking_safe_edit',{p_request_id:request,p_booking_id:original.id,p_patch:{phone:'123'},p_expected:{edit_revision:0,lifecycle_revision:0,detail_revision:0,status:'confirmed',spot:'',checked_in_at:null,checked_out_at:null}}]);
});
it('preserves unsplit legacy names and optional null fields',async()=>{await saveEditedBooking(original,{...original,comment:'hello'},request);expect(mock.rpc.mock.calls[0][1].p_patch).toEqual({comment:'hello'})});
it.each([{persons:0},{persons:1.5},{km:-1},{km:Infinity},{first_name:'a'.repeat(121)},{last_name:'a'.repeat(121)},{car_description:'a'.repeat(501)},{arrival_at:'infinity'},{departure_at:'2000-01-01T00:00:00Z'},{plate:''}])('rejects invalid patch %j',async patch=>{
 await expect(saveEditedBooking(original,{...original,...patch},request)).rejects.toThrow();expect(mock.rpc).not.toHaveBeenCalled();
});
it('requires all revision snapshots',async()=>{for(const key of ['edit_revision','lifecycle_revision','detail_revision'])await expect(saveEditedBooking({...original,[key]:undefined},{...original,phone:'x'},request)).rejects.toThrow('neu laden')});
it('sends identical retry context',async()=>{await saveEditedBooking(original,{...original,phone:'x'},request);await saveEditedBooking(original,{...original,phone:'x'},request);expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1])});
it.each(['PT409','40001','42501'])('rejects server failure %s',async code=>{mock.rpc.mockResolvedValue({error:{code}});await expect(saveEditedBooking(original,{...original,phone:'x'},request)).rejects.toThrow()});
it('returns confirmed server data without stale lifecycle fields',async()=>{mock.rpc.mockResolvedValue({data:{...original,edit_revision:5,paid:99,phone:null}});expect(await saveEditedBooking(original,{...original,phone:'x'},request)).toMatchObject({paid:99,edit_revision:5,phone:''})});
