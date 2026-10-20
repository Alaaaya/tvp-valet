import {afterEach,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('./offline-client',()=>({offlineSnapshot:()=>S,subscribeOffline:()=>()=>{},retryOffline:vi.fn(),discardOfflineFrom:vi.fn(),applyOfflineUpdate:vi.fn()}));
const S={ready:true,online:false,pending:0,syncing:false,error:'',events:[],shell:'ready',storagePersistent:true};
import {OfflineStatusBanner} from './offline-status';
afterEach(()=>vi.unstubAllEnvs());
it('flag off: compact status trigger, no exposed write controls',()=>{
 vi.stubEnv('VITE_DURABLE_OFFLINE_WRITES','false');
 const h=renderToStaticMarkup(<OfflineStatusBanner/>);
 expect(h).toContain('class="offline-indicator"');expect(h).not.toMatch(/Erneut synchronisieren|Offline-App installiert|class="offline-status"/i);
});
it('flag on: same compact offline trigger',()=>{expect(renderToStaticMarkup(<OfflineStatusBanner/>)).toMatch(/<button/)});
