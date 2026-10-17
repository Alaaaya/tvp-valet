import {beforeEach,describe,it,expect,vi} from 'vitest';
import {createRecoveringFetch,refreshSessionSafely} from './auth-recovery';
const session=(token:string|null)=>({data:{session:token?{access_token:token}:null},error:null});
const makeAuth=()=>({refreshSession:vi.fn().mockResolvedValue(session('fresh')),getSession:vi.fn().mockResolvedValue(session('fresh'))});
const base='https://project.supabase.co';
describe('shared auth recovery',()=>{
 it('refreshes first and falls back to getSession after an SDK refresh error',async()=>{
  const auth=makeAuth();auth.refreshSession.mockResolvedValue({data:{session:null},error:Error('rotation')});
  expect(await refreshSessionSafely(auth,'expired')).toBe('fresh');
  expect(auth.refreshSession.mock.invocationCallOrder[0]).toBeLessThan(auth.getSession.mock.invocationCallOrder[0]);
 });
 it('falls back after thrown refresh error',async()=>{
  const auth=makeAuth();auth.refreshSession.mockRejectedValue(Error('network'));
  expect(await refreshSessionSafely(auth,'expired')).toBe('fresh');
 });
 it('will not replay a rejected token when refresh and fallback fail',async()=>{
  const auth=makeAuth();auth.refreshSession.mockRejectedValue(Error());auth.getSession.mockResolvedValue(session('expired'));
  await expect(refreshSessionSafely(auth,'expired')).rejects.toThrow('abgelaufen');
 });
 it('shares refresh among concurrency and delayed failures of the same JWT',async()=>{
  const auth=makeAuth();let finish!:(value:ReturnType<typeof session>)=>void;
  auth.refreshSession.mockImplementation(()=>new Promise(r=>{finish=r}));
  const a=refreshSessionSafely(auth,'old'),b=refreshSessionSafely(auth,'old');
  expect(a).toBe(b);finish(session('fresh'));
  expect(await Promise.all([a,b])).toEqual(['fresh','fresh']);
  expect(await refreshSessionSafely(auth,'old')).toBe('fresh');
  expect(auth.refreshSession).toHaveBeenCalledTimes(1);
 });
 it.each(['/rest/v1/bookings','/functions/v1/dus-flights','/storage/v1/object/private/test'])('retries auth-rejected %s exactly once with fresh bearer',async path=>{
  const auth=makeAuth();const fetcher=vi.fn().mockResolvedValueOnce(new Response('expired',{status:401})).mockResolvedValueOnce(new Response('ok'));
  const fetch=createRecoveringFetch(base,()=>auth,fetcher);
  expect(await (await fetch(base+path,{headers:{Authorization:'Bearer expired'}})).text()).toBe('ok');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1][0].headers.get('Authorization')).toBe('Bearer fresh');
  expect(auth.refreshSession).toHaveBeenCalledTimes(1);
 });
 it('replays the exact write body only after gateway auth rejection',async()=>{
  const auth=makeAuth();const fetcher=vi.fn().mockResolvedValueOnce(new Response('',{status:401})).mockResolvedValueOnce(new Response('{}'));
  await createRecoveringFetch(base,()=>auth,fetcher)(base+'/rest/v1/rpc/check_booking',{method:'POST',headers:{Authorization:'Bearer expired','Content-Type':'application/json'},body:'{"p_id":"test","p_action":"in"}'});
  const replay=fetcher.mock.calls[1][0] as Request;
  expect(replay.method).toBe('POST');expect(await replay.text()).toBe('{"p_id":"test","p_action":"in"}');
 });
 it('bounds persistent401 to one retry',async()=>{
  const auth=makeAuth(),fetcher=vi.fn().mockImplementation(()=>Promise.resolve(new Response('',{status:401})));
  const response=await createRecoveringFetch(base,()=>auth,fetcher)(base+'/rest/v1/bookings');
  expect(response.status).toBe(401);expect(fetcher).toHaveBeenCalledTimes(2);expect(auth.refreshSession).toHaveBeenCalledTimes(1);
 });
 it('handles JWT-expired payload outside401',async()=>{
  const auth=makeAuth(),fetcher=vi.fn().mockResolvedValueOnce(new Response('{"message":"JWT expired","code":"PGRST301"}',{status:403})).mockResolvedValueOnce(new Response('ok'));
  await createRecoveringFetch(base,()=>auth,fetcher)(base+'/rest/v1/bookings');
  expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it.each([200,400,403,409,429,500,502])('does not replay writes on status %s',async status=>{
  const auth=makeAuth(),fetcher=vi.fn().mockResolvedValue(new Response('{}',{status}));
  await createRecoveringFetch(base,()=>auth,fetcher)(base+'/rest/v1/bookings',{method:'POST',body:'{}'});
  expect(fetcher).toHaveBeenCalledTimes(1);expect(auth.refreshSession).not.toHaveBeenCalled();
 });
 it('does not replay network errors',async()=>{
  const auth=makeAuth(),fetcher=vi.fn().mockRejectedValue(Error('offline'));
  await expect(createRecoveringFetch(base,()=>auth,fetcher)(base+'/rest/v1/bookings')).rejects.toThrow('offline');
  expect(fetcher).toHaveBeenCalledTimes(1);expect(auth.refreshSession).not.toHaveBeenCalled();
 });
 it.each([base+'/auth/v1/token?grant_type=refresh_token','https://elsewhere.test/rest/v1/bookings'])('never intercepts %s',async url=>{
  const auth=makeAuth(),fetcher=vi.fn().mockResolvedValue(new Response('',{status:401}));
  await createRecoveringFetch(base,()=>auth,fetcher)(url);
  expect(fetcher).toHaveBeenCalledTimes(1);expect(auth.refreshSession).not.toHaveBeenCalled();
 });
 it('returns the original rejection if refresh and getSession both fail',async()=>{
  const auth=makeAuth();auth.refreshSession.mockRejectedValue(Error('expired'));auth.getSession.mockResolvedValue(session(null));
  const fetcher=vi.fn().mockResolvedValue(new Response('unauthorized',{status:401}));
  const response=await createRecoveringFetch(base,()=>auth,fetcher)(base+'/rest/v1/bookings');
  expect(response.status).toBe(401);expect(fetcher).toHaveBeenCalledTimes(1);
 });
});
