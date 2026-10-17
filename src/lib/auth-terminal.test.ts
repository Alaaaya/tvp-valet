
import {describe,it,expect,vi} from 'vitest';
import {refreshSessionSafely,TerminalSessionError,TransientSessionError} from './auth-recovery';
const mk=()=>({refreshSession:vi.fn(),getSession:vi.fn(),signOut:vi.fn().mockResolvedValue({})});
const sess=(t:string|null,error:unknown=null)=>({data:{session:t?{access_token:t}:null},error});
const apiErr=(message:string,status=400)=>Object.assign(new Error(message),{name:'AuthApiError',status});
describe('terminal vs transient session recovery',()=>{
 it('expired access + INVALID refresh: local signout and terminal error',async()=>{
  const a=mk();a.refreshSession.mockResolvedValue({data:{session:null},error:apiErr('Invalid Refresh Token: Refresh Token Not Found')});a.getSession.mockResolvedValue(sess(null));
  await expect(refreshSessionSafely(a,'old')).rejects.toBeInstanceOf(TerminalSessionError);
  expect(a.signOut).toHaveBeenCalledWith({scope:'local'});
 });
 it('revoked refresh while SDK still holds the dead JWT: terminal',async()=>{
  const a=mk();a.refreshSession.mockResolvedValue({data:{session:null},error:apiErr('Refresh Token Already Used')});a.getSession.mockResolvedValue(sess('old'));
  await expect(refreshSessionSafely(a,'old')).rejects.toBeInstanceOf(TerminalSessionError);
  expect(a.signOut).toHaveBeenCalledTimes(1);
 });
 it('network failure never signs out',async()=>{
  const a=mk();a.refreshSession.mockRejectedValue(new TypeError('Failed to fetch'));a.getSession.mockResolvedValue(sess(null));
  await expect(refreshSessionSafely(a,'x')).rejects.toBeInstanceOf(TransientSessionError);
  expect(a.signOut).not.toHaveBeenCalled();
 });
 it('5xx and retryable fetch errors never sign out',async()=>{
  for(const e of [apiErr('upstream',503),Object.assign(new Error('x'),{name:'AuthRetryableFetchError',status:0})]){
   const a=mk();a.refreshSession.mockResolvedValue({data:{session:null},error:e});a.getSession.mockResolvedValue(sess(null));
   await expect(refreshSessionSafely(a,'y'+Math.random())).rejects.toBeInstanceOf(TransientSessionError);
   expect(a.signOut).not.toHaveBeenCalled();
  }
 });
 it('getSession error is transient, no signout',async()=>{
  const a=mk();a.refreshSession.mockResolvedValue({data:{session:null},error:apiErr('Invalid Refresh Token')});a.getSession.mockResolvedValue(sess(null,new Error('storage locked')));
  await expect(refreshSessionSafely(a,'z')).rejects.toBeInstanceOf(TransientSessionError);
  expect(a.signOut).not.toHaveBeenCalled();
 });
 it('sibling tab rotation still recovers via getSession',async()=>{
  const a=mk();a.refreshSession.mockResolvedValue({data:{session:null},error:apiErr('Refresh Token Already Used')});a.getSession.mockResolvedValue(sess('rotated'));
  expect(await refreshSessionSafely(a,'old2')).toBe('rotated');expect(a.signOut).not.toHaveBeenCalled();
 });
 it('wake path: recover rejection is swallowed and wake still runs (login screen via SIGNED_OUT)',async()=>{
  const {installSessionWake}=await import('./session-wake');
  const l:Record<string,()=>void>={};const doc={visibilityState:'visible',addEventListener:(t:string,f:()=>void)=>{l[t]=f},removeEventListener(){}};
  const win={addEventListener:(t:string,f:()=>void)=>{l[t]=f},removeEventListener(){}};
  const wake=vi.fn();installSessionWake(doc,win,()=>Promise.reject(new TerminalSessionError()),wake);
  l.focus();await new Promise(r=>setTimeout(r,0));expect(wake).toHaveBeenCalledTimes(1);
 });
});
