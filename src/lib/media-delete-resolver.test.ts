import {beforeEach,afterEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),storage:vi.fn()}));
vi.mock('../api',()=>({db:{rpc:m.rpc,from:m.from,storage:{from:m.storage}}}));
import {listBookingMedia} from './handover-api';
const booking='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('VITE_MEDIA_DELETE_V4','true');vi.stubEnv('VITE_MEDIA_DELETE_GATEWAY_URL','https://gateway.test/v4/media-delete')});
afterEach(()=>vi.unstubAllEnvs());
it('active resolver is sole authority, filters every tombstone and null path, keeps signature',async()=>{m.rpc.mockResolvedValue({data:[{id:'signature',path:booking+'/s.png',kind:'signature'},{id:'gone',path:booking+'/old.png',deleted:true},{id:'null',path:null},{id:'wrong',path:'other/p.png'}],error:null});expect(await listBookingMedia(booking)).toEqual([expect.objectContaining({id:'signature',kind:'signature'})]);expect(m.rpc).toHaveBeenCalledWith('resolve_booking_media_v4',{p_booking_id:booking});expect(m.from).not.toHaveBeenCalled();expect(m.storage).not.toHaveBeenCalled()});
it('resolver failure never falls back to raw ledger or Storage and resurrects deleted media',async()=>{m.rpc.mockResolvedValue({data:null,error:Error('unavailable')});await expect(listBookingMedia(booking)).rejects.toThrow('unavailable');expect(m.from).not.toHaveBeenCalled();expect(m.storage).not.toHaveBeenCalled()});
