// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const mocks=vi.hoisted(()=>({
 state:{accountId:'alice',pending:1,online:false},listeners:new Set<()=>void>(),pending:vi.fn(),list:vi.fn(),signed:vi.fn(),
}));
vi.mock('./offline-client',()=>({
 offlineSnapshot:()=>mocks.state,subscribeOffline:(fn:()=>void)=>{mocks.listeners.add(fn);return()=>mocks.listeners.delete(fn)},
 pendingOfflineMedia:mocks.pending,
}));
vi.mock('./handover-api',()=>({
 listBookingMedia:mocks.list,signedMediaUrl:mocks.signed,mediaBlob:vi.fn(),
}));
import {MediaGallery} from './gallery';
const blob=new Blob(['photo'],{type:'image/jpeg'});
const row={item:{id:'p1',path:'a/p1.jpg',kind:'photo',mime_type:'image/jpeg',captured_at:'2026-10-20',size_bytes:5},blob};
let root:ReturnType<typeof createRoot>,host:HTMLDivElement;
let seq=0;
beforeEach(()=>{
 vi.clearAllMocks();mocks.state={accountId:'alice',pending:1,online:false};
 mocks.pending.mockImplementation(async(id:string)=>id==='a'?[row]:[]);
 mocks.list.mockRejectedValue(Error('offline'));
 mocks.signed.mockImplementation(async(m:any)=>m.local_blob?URL.createObjectURL(m.local_blob):'https://signed/'+m.id);
 vi.stubGlobal('URL',class extends URL {
 static createObjectURL=vi.fn(()=> 'blob:test-'+(++seq));
 static revokeObjectURL=vi.fn();
 });
 host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals()});
async function render(id='a',key=0){await act(async()=>root.render(<MediaGallery bookingId={id} demo={false} refreshKey={key} local={[]}/>));await act(async()=>{})}
async function status(patch:Partial<typeof mocks.state>){await act(async()=>{mocks.state={...mocks.state,...patch};for(const fn of mocks.listeners)fn()});await act(async()=>{})}
describe('durable pending gallery',()=>{
 it('shows local captures despite unavailable online listing, including pending label',async()=>{
  await render();expect(host.querySelector('.mg-tile img')?.getAttribute('src')).toMatch(/^blob:/);
  expect(host.querySelector('.mg-tile')?.textContent).toContain('Ausstehend');
  expect(host.querySelector('[role=alert]')?.textContent).toContain('offline');
  expect(mocks.signed).toHaveBeenCalledWith(expect.objectContaining({local_blob:blob}));
 });
 it('reads durable media again after gallery unmount/remount (refresh)',async()=>{
  await render();const first=host.querySelector('img')!.getAttribute('src');
  await act(async()=>root.unmount());root=createRoot(host);await render();
  expect(mocks.pending).toHaveBeenCalledTimes(2);
  expect(host.querySelector('img')?.getAttribute('src')).not.toBe(first);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(first);
 });
 it('revokes previews and clears viewer on booking change',async()=>{
  await render();const url=host.querySelector('img')!.getAttribute('src');
  await act(async()=>{(host.querySelector('.mg-tile') as HTMLElement).click()});
  await render('b');expect(host.querySelector('img')).toBeNull();expect(host.querySelector('.gv')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
 });
 it('account switch cannot retain previews or accept old pending reads',async()=>{
  await render();const url=host.querySelector('img')!.getAttribute('src');let resolve!:(rows:any[])=>void;
  mocks.pending.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));
  await render('a',1);
  mocks.pending.mockResolvedValue([]);
  await status({accountId:'bob'});
  await act(async()=>resolve([row]));
  expect(host.querySelector('img')).toBeNull();expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
 });
 it('confirmation replaces local URL with ledger item and revokes owned blob',async()=>{
  await render();const url=host.querySelector('img')!.getAttribute('src');
  mocks.pending.mockResolvedValue([]);mocks.list.mockResolvedValue([row.item]);
  await status({pending:0,online:true});
  expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
  expect(host.querySelector('img')?.getAttribute('src')).toBe('https://signed/p1');
  expect(host.querySelector('.mg-tile')?.textContent).not.toContain('Ausstehend');
 });
});
