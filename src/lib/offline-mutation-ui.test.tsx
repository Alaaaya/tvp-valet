// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {blank} from '../model';
const api=vi.hoisted(()=>({save:vi.fn(),undo:vi.fn()}));
vi.mock('./offline-actions',()=>({saveOfflineHandover:api.save,offlineUndoHandover:api.undo}));
vi.mock('./camera',()=>({CameraScreen:({onDone}:any)=><button id="skip-camera" onClick={onDone}>Skip</button>}));
vi.mock('./signature',()=>({SignatureField:()=>null,renderSignature:vi.fn()}));
vi.mock('./use-edge-back',()=>({useEdgeBack:()=>{}}));
import {HandoverFlow} from './handover-flow';
import {UndoControls} from './undo-controls';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>,host:HTMLDivElement;
async function mount(ui:React.ReactNode){host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(ui))}
async function click(selector:string){await act(async()=>(host.querySelector(selector) as HTMLButtonElement).click())}
afterEach(async()=>{if(root){await act(async()=>root.unmount());host.remove()}vi.clearAllMocks()});
it('handover awaits durable offline adapter before onDone and retains pending marker',async()=>{
 const b={...blank(),sync_version:0,lifecycle_revision:0};
 const saved={...b,offline_pending:true};
 let finish!:(b:any)=>void;api.save.mockImplementation(()=>new Promise(r=>finish=r));
 const done=vi.fn();await mount(<HandoverFlow booking={b} action="in" onClose={()=>{}} onDone={done}/>);
 await click('#skip-camera');
 await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
 expect(api.save).toHaveBeenCalledOnce();expect(done).not.toHaveBeenCalled();
 expect(api.save.mock.calls[0][0]).toMatchObject({booking:b,action:'in',media:[]});
 await act(async()=>finish(saved));expect(done).toHaveBeenCalledWith(saved);
});
it('handover persistence rejection keeps draft and stable request id for retry',async()=>{
 api.save.mockRejectedValueOnce(Error('quota')).mockResolvedValueOnce({...blank(),offline_pending:true});
 const done=vi.fn();await mount(<HandoverFlow booking={blank()} action="in" onClose={()=>{}} onDone={done}/>);
 await click('#skip-camera');
 async function submit(){await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})}
 await submit();expect(done).not.toHaveBeenCalled();expect(host.querySelector('[role=alert]')?.textContent).toContain('quota');
 await submit();expect(api.save.mock.calls[1][0].requestId).toBe(api.save.mock.calls[0][0].requestId);expect(done).toHaveBeenCalledOnce();
});
it('undo calls durable alias only after confirmation and preserves retry snapshot',async()=>{
 const b={...blank(),checked_in_at:'2026-01-01T00:00:00Z'},saved={...b,checked_in_at:null,offline_pending:true};
 api.undo.mockRejectedValueOnce(Error('quota')).mockResolvedValueOnce(saved);
 const done=vi.fn();await mount(<UndoControls booking={b} onDone={done}/>);
 await click('.undo-btn');expect(api.undo).not.toHaveBeenCalled();
 await click('.undo-ok');expect(done).not.toHaveBeenCalled();expect(host.querySelector('[role=alert]')?.textContent).toContain('quota');
 await click('.undo-ok');expect(api.undo.mock.calls[1][0]).toEqual(api.undo.mock.calls[0][0]);expect(done).toHaveBeenCalledWith(saved);
});
