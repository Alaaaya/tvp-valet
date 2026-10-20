// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({clear:vi.fn(),record:vi.fn()}));
vi.mock('./customer-calls',async orig=>({...await orig<typeof import('./customer-calls')>(),clearCustomerCall:api.clear,recordCustomerCall:api.record}));
import {useCallMutation,canClearCall} from './use-call-mutation';
import {CustomerCallConflictError} from './customer-calls';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const booking:any={id:'a',status:'confirmed',checked_out_at:null,lifecycle_revision:3,customer_called_at:'2026-10-20T08:00:00Z'};
let h:ReturnType<typeof useCallMutation>,root:ReturnType<typeof createRoot>,host:HTMLDivElement;
const reload=vi.fn(),done=vi.fn(),onReloaded=vi.fn();
async function mount(){host=document.createElement('div');document.body.append(host);root=createRoot(host);await rerender()}
function Harness({session}:{session:string}){h=useCallMutation(session,{reload,done,onReloaded});return null}
async function rerender(session='one'){await act(async()=>root.render(<Harness session={session}/>))}
afterEach(async()=>{if(root){await act(async()=>root.unmount());host.remove()}api.clear.mockReset();api.record.mockReset();reload.mockReset();done.mockReset();onReloaded.mockReset()});
it('freezes both original snapshot and UUID across retries and changing props',async()=>{
 api.clear.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({});await mount();
 await act(async()=>h.run(booking,'clear'));await act(async()=>h.run({...booking,lifecycle_revision:8,customer_called_at:'2026-10-20T09:00:00Z'},'clear'));
 expect(api.clear.mock.calls[0][0]).toEqual(api.clear.mock.calls[1][0]);expect(api.clear.mock.calls[1][0].booking.lifecycle_revision).toBe(3);expect(done).toHaveBeenCalledTimes(1);
});
it('synchronous double activation issues only one mutation',async()=>{
 let finish!:(v:any)=>void;api.clear.mockImplementation(()=>new Promise(r=>finish=r));await mount();
 await act(async()=>{void h.run(booking,'clear');void h.run(booking,'clear')});expect(api.clear).toHaveBeenCalledTimes(1);
 await act(async()=>finish({}));
});
it('conflict failed refresh blocks all mutations until explicit reload and closes for fresh confirmation',async()=>{
 api.clear.mockRejectedValue(new CustomerCallConflictError());reload.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);await mount();
 await act(async()=>h.run(booking,'clear'));expect(h.stale).toBe(true);
 await act(async()=>h.run({...booking,lifecycle_revision:8},'clear'));expect(api.clear).toHaveBeenCalledTimes(1);expect(h.stale).toBe(true);
 await act(async()=>h.run(booking,'clear'));expect(api.clear).toHaveBeenCalledTimes(1);expect(onReloaded).toHaveBeenCalledTimes(1);expect(done).not.toHaveBeenCalled();
});
it('session change ignores late success and late errors without changing new session busy state',async()=>{
 let finish!:(v:any)=>void;api.clear.mockImplementation(()=>new Promise(r=>finish=r));await mount();
 await act(async()=>{void h.run(booking,'clear')});await rerender('two');await act(async()=>finish({}));
 expect(done).not.toHaveBeenCalled();expect(reload).not.toHaveBeenCalled();expect(h.busy).toBe(false);
});
it('success refresh failure is not retried as a mutation and confirmation already closes',async()=>{
 api.clear.mockResolvedValue({});reload.mockRejectedValue(new Error('offline'));await mount();await act(async()=>h.run(booking,'clear'));
 expect(done).toHaveBeenCalledTimes(1);expect(api.clear).toHaveBeenCalledTimes(1);expect(h.error).toBe('offline');
});
it('guards row and detail availability on the exact same valid open snapshot',()=>{
 expect(canClearCall(booking,true)).toBe(true);
 for(const patch of [{checked_out_at:undefined},{checked_out_at:'2026-10-20T09:00:00Z'},{status:'cancelled'},{customer_called_at:null},{customer_called_at:'bad'},{lifecycle_revision:undefined},{lifecycle_revision:-1}])expect(canClearCall({...booking,...patch},true)).toBe(false);
 expect(canClearCall(booking,false)).toBe(false);
});

it('passes canonical replay state through rather than assuming the current call is null',async()=>{
 const receipt={receipt_id:'r',occurred_at:'2026-10-20T08:00:00Z',customer_called_at:'2026-10-20T09:00:00Z',lifecycle_revision:4};
 api.clear.mockResolvedValue(receipt);await mount();await act(async()=>h.run(booking,'clear'));
 expect(done).toHaveBeenCalledWith('clear',receipt);expect(api.clear).toHaveBeenCalledTimes(1);
});

it('same-user logout and login invalidates synchronously before any rerender',async()=>{
 let finish!:(v:any)=>void;api.clear.mockImplementation(()=>new Promise(r=>finish=r));await mount();
 await act(async()=>{void h.run(booking,'clear');h.invalidate()});
 await act(async()=>finish({customer_called_at:null}));
 expect(done).not.toHaveBeenCalled();expect(reload).not.toHaveBeenCalled();expect(h.busy).toBe(false);
});
