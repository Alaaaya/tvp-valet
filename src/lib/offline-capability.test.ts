import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {blank,type Booking} from '../model';
const rt=vi.hoisted(()=>({enqueueOffline:vi.fn(),cachedOfflineBooking:vi.fn(),cachedOfflineOperations:vi.fn()}));
const legacy=vi.hoisted(()=>({edit:vi.fn(),spot:vi.fn(),status:vi.fn(),pay:vi.fn(),call:vi.fn(),clear:vi.fn(),handover:vi.fn(),undo:vi.fn(),op:vi.fn(),save:vi.fn(),rpc:vi.fn(),upload:vi.fn()}));
vi.mock('./offline-client',()=>rt);
vi.mock('../api',()=>({db:{rpc:legacy.rpc,storage:{from:()=>({upload:legacy.upload})}},saveBooking:legacy.save}));
vi.mock('./booking-safe-edit',()=>({saveEditedBooking:legacy.edit,bookingEditFields:['plate','customer_name']}));
vi.mock('./booking-actions',()=>({changeBookingSpot:legacy.spot,transitionBookingStatus:legacy.status}));
vi.mock('./booking-payments',async o=>({...await o<typeof import('./booking-payments')>(),recordBookingPayment:legacy.pay}));
vi.mock('./customer-calls',()=>({recordCustomerCall:legacy.call,clearCustomerCall:legacy.clear}));
vi.mock('./operations',()=>({recordBookingOperation:legacy.op}));
vi.mock('./handover-undo',async o=>({...await o<typeof import('./handover-undo')>(),undoHandover:legacy.undo}));
vi.mock('./handover-api',async o=>({...await o<typeof import('./handover-api')>(),saveHandover:legacy.handover}));
import {durableOfflineEnabled,durableBookingReady} from './offline-capability';
import * as A from './offline-actions';
const id='12345678-1234-4234-8234-123456789012';
let b:Booking;
const setOnline=(v:boolean)=>Object.defineProperty(globalThis.navigator,'onLine',{value:v,configurable:true});
beforeEach(()=>{vi.clearAllMocks();setOnline(true);b={...blank(),id,sync_version:undefined,lifecycle_revision:0,detail_revision:0,edit_revision:0,plate:'D-AA 1',customer_name:'T',total:40,status:'confirmed'};
 rt.cachedOfflineBooking.mockReturnValue(b);rt.cachedOfflineOperations.mockReturnValue(undefined);
 legacy.spot.mockResolvedValue(b);legacy.status.mockResolvedValue(b);legacy.edit.mockResolvedValue(b);legacy.pay.mockResolvedValue({});legacy.call.mockResolvedValue({});legacy.op.mockResolvedValue({});legacy.save.mockResolvedValue(undefined);legacy.undo.mockResolvedValue(b);legacy.handover.mockResolvedValue(b);legacy.clear.mockResolvedValue({});});
afterEach(()=>{vi.unstubAllEnvs();setOnline(true)});
describe('durable offline capability gate',()=>{
 it('test default enables, build default is off',()=>{expect(durableOfflineEnabled()).toBe(true);vi.stubEnv('VITE_DURABLE_OFFLINE_WRITES','');expect(durableOfflineEnabled()).toBe(false);vi.stubEnv('VITE_DURABLE_OFFLINE_WRITES','false');expect(durableBookingReady({sync_version:3})).toBe(false)});
 it('flag on but schema field missing is not ready',()=>{expect(durableBookingReady({sync_version:undefined})).toBe(false);expect(durableBookingReady({sync_version:2})).toBe(true)});
 it('missing backend: online uses legacy API, zero enqueue, zero RPC, no fake pending',async()=>{
  const r=await A.offlineChangeSpot({booking:b,requestId:id,spot:'9'});
  expect(legacy.spot).toHaveBeenCalledTimes(1);expect(r.offline_pending).toBeUndefined();
  await A.saveOfflineEdit(b,{...b,plate:'X'},id);await A.offlineTransitionStatus({booking:b,requestId:id,status:'no_show'});
  await A.offlineRecordPayment({booking:b,requestId:id,amountCents:100,method:'cash'});
  const c=await A.offlineRecordCustomerCall({booking:b,requestId:id});expect(c.offline_pending).toBeUndefined();
  await A.offlineRecordOperation(id,'taken_away');await A.saveOfflineBooking(b,true);
  expect(rt.enqueueOffline).not.toHaveBeenCalled();expect(legacy.rpc).not.toHaveBeenCalled();
 });
 it('flag false rejects even with sync_version present, offline: clear error and nothing queued',async()=>{
  vi.stubEnv('VITE_DURABLE_OFFLINE_WRITES','false');b.sync_version=5;
  await A.offlineChangeSpot({booking:b,requestId:id,spot:'9'});expect(legacy.spot).toHaveBeenCalled();expect(rt.enqueueOffline).not.toHaveBeenCalled();
  setOnline(false);
  const calls=[()=>A.offlineChangeSpot({booking:b,requestId:id,spot:'8'}),()=>A.saveOfflineEdit(b,{...b,plate:'Y'},id),()=>A.offlineRecordCustomerCall({booking:b,requestId:id}),()=>A.offlineRecordOperation(id,'retrieved'),()=>A.saveOfflineBooking(b,true),()=>A.offlineAppendPhoto(b,new Blob(['x'],{type:'image/png'}))];
  for(const f of calls)await expect(f()).rejects.toThrow(/deaktiviert|disabled/i);
  expect(rt.enqueueOffline).not.toHaveBeenCalled();expect(legacy.rpc).not.toHaveBeenCalled();
 });
 it('flag on and sync_version present queues durably, not legacy',async()=>{
  b.sync_version=1;rt.enqueueOffline.mockImplementation(async(x:{projected:Booking})=>({booking:x.projected}));
  const r=await A.offlineChangeSpot({booking:b,requestId:id,spot:'9'});
  expect(r.offline_pending).toBe(true);expect(legacy.spot).not.toHaveBeenCalled();
 });
});
