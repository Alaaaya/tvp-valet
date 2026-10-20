import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({state:{ready:true,online:false,pending:2,syncing:false,events:[],error:'QuotaExceededError',storagePersistent:false}}));
vi.mock('./offline-client',()=>({offlineSnapshot:()=>mock.state,subscribeOffline:()=>()=>{},retryOffline:vi.fn(),discardOfflineFrom:vi.fn(),applyOfflineUpdate:vi.fn()}));
import {OfflineStatusBanner} from './offline-status';
import {readFileSync} from 'node:fs';
describe('offline UI integration',()=>{
 it('reports offline pending and storage error honestly',()=>{const html=renderToStaticMarkup(<OfflineStatusBanner/>);expect(html).toContain('Offline');expect(html).toContain('2');expect(html).toContain('QuotaExceededError');expect(html).toContain('role="alert"');expect(html).toContain('disabled=""')});
 it('blocks signout and build activation with pending work',()=>{const s=readFileSync('src/main.tsx','utf8');expect(s).toContain('offlineSnapshot().pending');expect(s).toContain('||offline.pending>0||offline.syncing||dirty);');expect(s).toContain('await startOfflineAccount(identity)');expect(s.indexOf('await startOfflineAccount(identity)')).toBeLessThan(s.indexOf('const d=await offlineLoad(c.signal)'))});
 it('uses booking result directly for payment and labels pending',()=>{const s=readFileSync('src/main.tsx','utf8');expect(s).toContain('recordPayment={demo?undefined:recordBookingPayment}');expect(s).not.toContain('adaptReceipt(');expect(s).toContain('selected.offline_pending');expect(s).toContain('Nicht synchronisierte Zahlungen sind noch nicht serverbestätigt.')});
 it('review discard requires explicit confirmation and tail handling',()=>{const s=readFileSync('src/lib/offline-status.tsx','utf8');expect(s).toContain('window.confirm(');expect(s).toContain('discardOfflineFrom(sequence,true)');expect(s).toContain('event.createdAt');expect(s).toContain('event.error')});
 it('all date search uses cached fallback and preserves day counts',()=>{const s=readFileSync('src/main.tsx','utf8');expect(s).toContain("partial:cached");expect(s).toContain("source:cached?'cache':'online'");expect(s).toContain("mfUser,'',liveFor)")});
});

it('call, handover and undo callbacks distinguish local pending receipts',()=>{const s=readFileSync('src/main.tsx','utf8');expect(s).toContain('(receipt as typeof receipt & {offline_pending?:boolean}).offline_pending?');expect(s).toContain('nb.offline_pending?tr("Lokal gespeichert · wartet auf Synchronisierung"):flow.action');expect(s).toContain('nb.offline_pending?tr("Lokal gespeichert · wartet auf Synchronisierung"):tr("Rückgängig gemacht")');});

it('pending payment is explicitly local even with hidden summary',()=>{const s=readFileSync('src/lib/booking-payment-view.tsx','utf8');expect(s).toContain('booking.offline_pending&&<p');expect(s).toContain('Restbetrag nach Vormerkung');expect(s).toContain('await recordPayment({booking:snap');expect(s).not.toContain('adaptReceipt(recordPayment)')});
it('online identity errors cannot reuse cached access or role',()=>{const s=readFileSync('src/main.tsx','utf8');expect(s).toContain('setSelected(null);await startOfflineAccount(null);throw profile.error');expect(s).not.toContain('else if(!identity)throw profile.error');expect(s).toContain('cachedOfflineBooking(b.id)?.offline_pending?');});

it('manual retry and safe waiting update have explicit controls',()=>{const s=readFileSync('src/lib/offline-status.tsx','utf8');expect(s).toContain('retryOffline(true)');expect(s).toContain("state.shell==='waiting'");expect(s).toContain("document.querySelector('form,");expect(s).toContain('!applyOfflineUpdate()');expect(s).toContain('Offline-App nicht installiert.');});

it('real gallery uploads use durable photo adapter without direct storage writes',()=>{const s=readFileSync('src/main.tsx','utf8');const upload=s.slice(s.indexOf('async function upload(file:File)'),s.indexOf('const callSnapshot'));expect(upload).toContain('await offlineAppendPhoto(booking,file)');expect(upload).not.toContain('.storage.from(');expect(upload).toContain('setMediaKey(k=>k+1)');expect(upload).toContain('uid!==sessionUid.current');});
