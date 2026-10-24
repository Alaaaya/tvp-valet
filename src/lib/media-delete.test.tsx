// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const m=vi.hoisted(()=>({state:{accountId:'a',pending:0,online:true,ready:true},list:vi.fn(),signed:vi.fn(),del:vi.fn()}));
vi.mock('./offline-client',()=>({offlineSnapshot:()=>m.state,subscribeOffline:()=>()=>{},pendingOfflineMedia:async()=>[]}));
vi.mock('./handover-api',()=>({listBookingMedia:m.list,signedMediaUrl:m.signed,mediaBlob:vi.fn()}));
vi.mock('./media-delete-api',()=>({deleteBookingMedia:m.del}));
import {MediaGallery} from './gallery';
const item={id:'s1',path:'b/s1.png',kind:'signature',mime_type:'image/png',captured_at:'2026-10-20',size_bytes:5};
let root:ReturnType<typeof createRoot>,host:HTMLDivElement;
const flush=async()=>{await act(async()=>{await new Promise(r=>setTimeout(r,0))})};
const BID='11111111-1111-4111-8111-111111111111';
async function mount(canDelete:boolean){await act(async()=>{root.render(<MediaGallery bookingId={BID} demo={false} refreshKey={0} local={[]} canDelete={canDelete}/>)});await flush();await act(async()=>{(host.querySelector('.mg-tile') as HTMLElement).click()});await flush()}
beforeEach(()=>{vi.clearAllMocks();m.state={accountId:'a',pending:0,online:true,ready:true};m.list.mockResolvedValue([item]);m.signed.mockResolvedValue('https://x/s1');host=document.createElement('div');document.body.appendChild(host);root=createRoot(host)});
afterEach(()=>{act(()=>root.unmount());host.remove()});
const q=(s:string)=>document.querySelector(s) as HTMLElement|null;
describe('admin media delete',()=>{
 it('staff never sees delete',async()=>{await mount(false);expect(q('.gv-del')).toBeNull()});
 it('admin: confirm required, cancel does nothing',async()=>{await mount(true);await act(async()=>{q('.gv-del')!.click()});expect(q('.md-card')).not.toBeNull();expect(q('.md-card')!.textContent).toMatch(/Unterschrift|signature/i);await act(async()=>{q('.md-cancel')!.click()});expect(q('.md-card')).toBeNull();expect(m.del).not.toHaveBeenCalled()});
 it('failure keeps item, retry reuses request id, then success closes',async()=>{m.del.mockRejectedValueOnce(Error('net')).mockResolvedValueOnce({deleted:true});await mount(true);await act(async()=>{q('.gv-del')!.click()});await act(async()=>{q('.md-go')!.click()});await flush();expect(q('.md-err')!.textContent).toContain('net');await act(async()=>{q('.md-go')!.click()});await flush();expect(m.del).toHaveBeenCalledTimes(2);expect(m.del.mock.calls[0][1]).toBe(m.del.mock.calls[1][1]);expect(q('.gv')).toBeNull()});
 it('offline blocks confirm',async()=>{await mount(true);m.state={...m.state,online:false};await act(async()=>{q('.gv-del')!.click()});await flush();expect((q('.md-go') as HTMLButtonElement|null)?.disabled??true).toBe(true)});
 it('no delete log displayed in viewer',async()=>{await mount(true);expect(document.body.textContent).not.toMatch(/gelöscht von|deleted by|Löschprotokoll/i)});
});
