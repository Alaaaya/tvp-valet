
import {describe,it,expect,vi,beforeEach} from 'vitest';
const {getSession,refreshSession,signOut}=vi.hoisted(()=>({getSession:vi.fn(),refreshSession:vi.fn(),signOut:vi.fn().mockResolvedValue({})}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getSession,refreshSession,signOut}})}));
vi.hoisted(()=>{import.meta.env.VITE_SUPABASE_URL='https://p.supabase.co';import.meta.env.VITE_SUPABASE_ANON_KEY='k'});
import {recoverSession} from './api';
import {TerminalSessionError,TransientSessionError} from './lib/auth-recovery';
const sess=(t:string|null,error:unknown=null)=>({data:{session:t?{access_token:t}:null},error});
beforeEach(()=>{vi.clearAllMocks()});
describe('recoverSession',()=>{
 it('invalid refresh while SDK holds same dead token: terminal local signout',async()=>{
  getSession.mockResolvedValue(sess('dead'));
  refreshSession.mockResolvedValue({data:{session:null},error:Object.assign(new Error('Invalid Refresh Token: Refresh Token Not Found'),{name:'AuthApiError',status:400})});
  await expect(recoverSession()).rejects.toBeInstanceOf(TerminalSessionError);
  expect(signOut).toHaveBeenCalledWith({scope:'local'});
 });
 it('getSession error is transient, no signout',async()=>{
  getSession.mockResolvedValue(sess(null,new Error('lock')));
  await expect(recoverSession()).rejects.toBeInstanceOf(TransientSessionError);
  expect(signOut).not.toHaveBeenCalled();expect(refreshSession).not.toHaveBeenCalled()
 });
 it('network failure no signout',async()=>{
  getSession.mockResolvedValue(sess('t'));refreshSession.mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(recoverSession()).rejects.toBeInstanceOf(TransientSessionError);
  expect(signOut).not.toHaveBeenCalled();
 });
 it('no session returns empty',async()=>{getSession.mockResolvedValue(sess(null));expect(await recoverSession()).toBe('');});
});
