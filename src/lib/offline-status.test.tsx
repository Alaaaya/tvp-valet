import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({state:{ready:true,online:false,pending:2,syncing:false,events:[],error:'QuotaExceededError',storagePersistent:false}}));
vi.mock('./offline-client',()=>({offlineSnapshot:()=>mock.state,subscribeOffline:()=>()=>{},retryOffline:vi.fn(),discardOfflineFrom:vi.fn()}));
import {OfflineStatusBanner} from './offline-status';
import {readFileSync} from 'node:fs';
describe('offline UI integration',()=>{
 it('reports offline pending and storage error honestly',()=>{const html=renderToStaticMarkup(<OfflineStatusBanner/>);expect(html).toContain('Offline');expect(html).toContain('2');expect(html).toContain('QuotaExceededError');expect(html).toContain('role="alert"');expect(html).toContain('disabled=""')});
 it('blocks signout and build activation with pending work',()=>{const s=readFileSync('src/main.tsx','utf8');expect(s).toContain('offlineSnapshot().pending');expect(s).toContain('||offline.pending>0||offline.syncing||dirty);');expect(s).toContain('await startOfflineAccount(identity)');expect(s.indexOf('await startOfflineAccount(identity)')).toBeLessThan(s.indexOf('const d=await offlineLoad(c.signal)'))});
 it('uses booking result directly for payment and labels pending',()=>{const s=readFileSync('src/main.tsx','utf8');expect(s).toContain('recordPayment={demo?undefined:recordBookingPayment}');expect(s).not.toContain('adaptReceipt(');expect(s).toContain('selected.offline_pending');expect(s).toContain('Nicht synchronisierte Zahlungen sind noch nicht serverbestätigt.')});
 it('review discard requires explicit confirmation and tail handling',()=>{const s=readFileSync('src/lib/offline-status.tsx','utf8');expect(s).toContain('window.confirm(');expect(s).toContain('discardOfflineFrom(sequence,true)');expect(s).toContain('event.createdAt');expect(s).toContain('event.error')});
 it('all date search uses cached fallback and preserves day counts',()=>{const s=readFileSync('src/main.tsx','utf8');expect(s).toContain("partial:cached");expect(s).toContain("source:cached?'cache':'online'");expect(s).toContain("mfUser,'',liveFor)")});
});
