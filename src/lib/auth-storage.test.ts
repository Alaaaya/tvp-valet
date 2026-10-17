import {afterEach,describe,it,expect,vi} from 'vitest';
const {createClient}=vi.hoisted(()=>({createClient:vi.fn(()=>({auth:{}}))}));
vi.mock('@supabase/supabase-js',()=>({createClient}));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();vi.clearAllMocks()});
describe('browser session configuration',()=>{
  it('uses persistent local storage and automatic token refresh without migrating existing keys',async()=>{
    const storage={getItem:vi.fn(),setItem:vi.fn(),removeItem:vi.fn()};
    vi.stubGlobal('window',{localStorage:storage});
    vi.stubEnv('VITE_SUPABASE_URL','https://test.supabase.co');vi.stubEnv('VITE_SUPABASE_ANON_KEY','public');
    await import('../api');
    expect(createClient).toHaveBeenCalledWith('https://test.supabase.co','public',expect.objectContaining({auth:expect.objectContaining({storage,persistSession:true,autoRefreshToken:true})}));
    expect((createClient.mock.calls[0] as any)[2].auth.storageKey).toBeUndefined();
    expect(storage.removeItem).not.toHaveBeenCalled();expect(storage.setItem).not.toHaveBeenCalled();
  });
  it('does not crash when private-browser storage access is blocked',async()=>{
    vi.stubGlobal('window',{get localStorage(){throw new DOMException('Blocked','SecurityError')}});
    vi.stubEnv('VITE_SUPABASE_URL','https://test.supabase.co');vi.stubEnv('VITE_SUPABASE_ANON_KEY','public');
    await import('../api');
    expect((createClient.mock.calls[0] as any)[2].auth.storage).toBeUndefined();
    expect((createClient.mock.calls[0] as any)[2].auth.persistSession).toBe(true);
  });
});
