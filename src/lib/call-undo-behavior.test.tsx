// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('./i18n',async importOriginal=>({...await importOriginal<typeof import('./i18n')>(),t:(k:string)=>k}));
const remove=vi.fn();
vi.mock('./customer-calls',()=>({removeCustomerCall:(a:any)=>remove(a)}));
import {CallUndo} from './call-undo';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const UUID=/^[0-9a-f]{8}-/;
const bk:any={id:'b1',plate:'D-AB 1',customer_name:'Max',status:'confirmed',customer_called_at:'2026-10-20T08:15:00Z',checked_out_at:null,lifecycle_revision:3};
const mounted:any[]=[];
async function mount(props:any){const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);mounted.push({host,root});
  const render=async(p:any)=>{await act(async()=>{root.render(<CallUndo variant="row" known session="s1" onDone={async()=>{}} {...p}/>)})};
  await render(props);return {host,render}}
afterEach(async()=>{for(const m of mounted.splice(0)){await act(async()=>m.root.unmount());m.host.remove()}remove.mockReset()});
const click=async(el:Element|null)=>{await act(async()=>{(el as HTMLElement).dispatchEvent(new MouseEvent('click',{bubbles:true}))})};
const open=async()=>click(document.querySelector('.call-undo-btn'));
const ok=()=>document.querySelector('.call-undo-ok') as HTMLButtonElement|null;
const conflict=()=>Object.assign(new Error('conflict'),{code:'PT409',name:'CustomerCallConflictError'});
describe('call undo behaviour',()=>{
  it('failed reload after PT409 stays on Neu laden and never re-deletes with the old snapshot',async()=>{
    remove.mockRejectedValueOnce(conflict());
    const onReload=vi.fn().mockRejectedValue(new Error('offline'));
    await mount({booking:bk,onReload});await open();await click(ok());
    expect(remove).toHaveBeenCalledTimes(1);expect(ok()!.textContent).toBe('Neu laden');
    await click(ok());expect(onReload).toHaveBeenCalledTimes(2);expect(remove).toHaveBeenCalledTimes(1);expect(ok()!.textContent).toBe('Neu laden');
    expect(document.querySelector('.call-undo-dlg')!.textContent).toMatch(/offline/);
  });
  it('after successful reload with a new revision the new snapshot gets a fresh uuid and plain label',async()=>{
    remove.mockRejectedValueOnce(conflict());
    const onReload=vi.fn().mockResolvedValue(undefined);
    const m=await mount({booking:bk,onReload});await open();await click(ok());
    expect(ok()!.textContent).toBe('Anruf löschen');
    await m.render({booking:{...bk,lifecycle_revision:4},onReload});
    expect(ok()!.textContent).toBe('Anruf löschen');
    remove.mockResolvedValueOnce({});await click(ok());
    const [a,b]=[remove.mock.calls[0][0],remove.mock.calls[1][0]];
    expect(a.requestId).toMatch(UUID);expect(b.requestId).not.toBe(a.requestId);expect(b.booking.lifecycle_revision).toBe(4);
  });
  it('session change closes the dialog and forgets the uuid',async()=>{
    remove.mockRejectedValueOnce(new Error('net'));
    const m=await mount({booking:bk});await open();await click(ok());
    expect(ok()!.textContent).toBe('Erneut versuchen');const first=remove.mock.calls[0][0].requestId;
    await m.render({booking:bk,session:'s2'});expect(document.querySelector('.call-undo-dlg')).toBeNull();
    remove.mockResolvedValueOnce({});await open();await click(ok());
    expect(remove.mock.calls[1][0].requestId).not.toBe(first);
  });
  it('same-snapshot retry reuses the uuid',async()=>{
    remove.mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce({});
    await mount({booking:bk});await open();await click(ok());await click(ok());
    expect(remove.mock.calls[1][0].requestId).toBe(remove.mock.calls[0][0].requestId);
  });
  it('onDone failure after a successful clear never replays the clear',async()=>{
    remove.mockResolvedValue({});
    const onDone=vi.fn().mockRejectedValue(new Error('refresh failed'));
    const m=await mount({booking:bk,onDone});await open();await click(ok());
    expect(remove).toHaveBeenCalledTimes(1);expect(onDone).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.call-undo-dlg')).toBeNull();
    expect(m.host.textContent).toMatch(/refresh failed/);
  });
  it('button and dialog clicks do not reach a React parent onClick (row open)',async()=>{
    const parent=vi.fn();const host=document.createElement('div');document.body.appendChild(host);
    const root=createRoot(host);mounted.push({host,root});
    await act(async()=>{root.render(<div onClick={parent}><CallUndo variant="row" known session="s1" booking={bk} onDone={async()=>{}}/></div>)});
    await open();await click(document.querySelector('.call-undo-dlg'));await click(document.querySelector('.call-undo-scrim'));
    expect(parent).not.toHaveBeenCalled();expect(document.querySelector('.call-undo-dlg')).toBeNull();
  });
  it('network retry keeps the original snapshot and uuid even if the booking prop changes',async()=>{
    remove.mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce({});
    const m=await mount({booking:bk});await open();await click(ok());
    expect(ok()!.textContent).toBe('Erneut versuchen');
    await m.render({booking:{...bk,lifecycle_revision:9,customer_called_at:'2026-10-20T09:00:00Z'}});
    expect(ok()!.textContent).toBe('Erneut versuchen');
    await click(ok());
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove.mock.calls[1][0].requestId).toBe(remove.mock.calls[0][0].requestId);
    expect(remove.mock.calls[1][0].booking.lifecycle_revision).toBe(3);
    expect(remove.mock.calls[1][0].booking.customer_called_at).toBe(bk.customer_called_at);
  });
  it('after PT409 on retry, no mutation until an explicit successful reload and fresh confirmation',async()=>{
    remove.mockRejectedValueOnce(new Error('net')).mockRejectedValueOnce(conflict());
    const onReload=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const m=await mount({booking:bk,onReload});await open();await click(ok());await click(ok());
    expect(remove).toHaveBeenCalledTimes(2);expect(ok()!.textContent).toBe('Neu laden');
    await click(ok());expect(remove).toHaveBeenCalledTimes(2);expect(onReload).toHaveBeenCalledTimes(2);
    expect(ok()!.textContent).toBe('Anruf löschen');
    await m.render({booking:{...bk,lifecycle_revision:5},onReload});
    expect(remove).toHaveBeenCalledTimes(2);
    remove.mockResolvedValueOnce({});await click(ok());
    expect(remove).toHaveBeenCalledTimes(3);expect(remove.mock.calls[2][0].booking.lifecycle_revision).toBe(5);
    expect(remove.mock.calls[2][0].requestId).not.toBe(remove.mock.calls[0][0].requestId);
  });
  it('session change mid-flight suppresses onDone and onReload',async()=>{
    let release!:(v:any)=>void;remove.mockImplementationOnce(()=>new Promise(r=>{release=r}));
    const onDone=vi.fn(async()=>{}),onReload=vi.fn(async()=>{});
    const m=await mount({booking:bk,onDone,onReload});await open();await click(ok());
    await m.render({booking:bk,onDone,onReload,session:'s2'});
    await act(async()=>{release({})});
    expect(onDone).not.toHaveBeenCalled();expect(onReload).not.toHaveBeenCalled();
    expect(document.querySelector('.call-undo-dlg')).toBeNull();
  });
});
