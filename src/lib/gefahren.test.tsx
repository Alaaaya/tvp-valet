// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({uid:'a',rpc:vi.fn()}));
vi.mock('../api',()=>({db:{auth:{getSession:async()=>({data:{session:{user:{id:m.uid}}},error:null})},rpc:(...args:unknown[])=>m.rpc(...args)}}));
import {saveGefahren,validGefahren} from './gefahren-api';
import {GefahrenPicker,GefahrenButton} from './gefahren-picker';
import {setLanguage} from './i18n';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>|undefined,host:HTMLDivElement;
beforeEach(()=>{m.uid='a';m.rpc.mockReset();Object.defineProperty(navigator,'onLine',{configurable:true,value:true})});
afterEach(async()=>{if(root){await act(async()=>root!.unmount());host.remove();root=undefined}setLanguage('de')});
async function mount(x:React.ReactNode){host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root!.render(x))}
for(const value of [1,2,3,4,null] as const)it('narrow integer RPC '+value,async()=>{
 m.rpc.mockResolvedValue({data:{id:'b',gefahren:value},error:null});
 expect(await saveGefahren('b',value,'a')).toBe(value);
 expect(m.rpc).toHaveBeenCalledExactlyOnceWith('set_booking_gefahren',{p_id:'b',p_value:value});
});
for(const v of ['1',true,0,5,1.5,{},[],undefined,NaN])it('reject invalid '+String(v),async()=>{
 expect(validGefahren(v)).toBe(false);await expect(saveGefahren('b',v as any,'a')).rejects.toThrow();expect(m.rpc).not.toHaveBeenCalled();
});
it('offline fails closed without RPC or outbox',async()=>{
 Object.defineProperty(navigator,'onLine',{configurable:true,value:false});await expect(saveGefahren('b',1,'a')).rejects.toThrow();expect(m.rpc).not.toHaveBeenCalled();
});
it('permission failure never confirms',async()=>{m.rpc.mockResolvedValue({error:new Error('42501 denied')});await expect(saveGefahren('b',1,'a')).rejects.toThrow('42501')});
it('wrong account before send does not write',async()=>{await expect(saveGefahren('b',1,'other')).rejects.toThrow();expect(m.rpc).not.toHaveBeenCalled()});
it('account switch during response is rejected',async()=>{
 m.rpc.mockImplementation(async()=>{m.uid='new';return {data:{id:'b',gefahren:1},error:null}});await expect(saveGefahren('b',1,'a')).rejects.toThrow();
});
for(const result of [{id:'other',gefahren:1},{id:'b',gefahren:2},{id:'b',gefahren:'1'},null])it('reject unconfirmed response '+JSON.stringify(result),async()=>{m.rpc.mockResolvedValue({data:result,error:null});await expect(saveGefahren('b',1,'a')).rejects.toThrow()});
it('selected option clear and failed save leave visible error',async()=>{
 const fn=vi.fn().mockRejectedValue(new Error('permission denied')),close=vi.fn();
 await mount(<GefahrenPicker value={2} onSave={fn} onClose={close}/>);
 expect(host.querySelectorAll('[aria-pressed=true]')[0].textContent).toContain('2 gefahren');
 await act(async()=>host.querySelectorAll<HTMLButtonElement>('.dps-row')[4].click());
 expect(fn).toHaveBeenCalledWith(null);expect(host.querySelector('[role=alert]')?.textContent).toBe('permission denied');expect(close).not.toHaveBeenCalled();
});
it('prevents simultaneous writes and ignores stale unmounted result',async()=>{
 let resolve!:()=>void;const fn=vi.fn(()=>new Promise<void>(r=>resolve=r)),close=vi.fn();
 await mount(<GefahrenPicker value={null} onSave={fn} onClose={close}/>);
 await act(async()=>{host.querySelectorAll<HTMLButtonElement>('.dps-row')[0].click();host.querySelectorAll<HTMLButtonElement>('.dps-row')[1].click()});
 expect(fn).toHaveBeenCalledTimes(1);expect([...host.querySelectorAll('button')].every(b=>b.disabled)).toBe(true);
 await act(async()=>root!.render(<div/>));await act(async()=>resolve());expect(close).not.toHaveBeenCalled();
});
for(const lang of ['de','en','ar'] as const)it('labels and clear reload '+lang,async()=>{
 setLanguage(lang);await mount(<GefahrenButton value={3}/>);expect(host.textContent).toContain('3 gefahren');
 await act(async()=>root!.render(<GefahrenButton value={null}/>));expect(host.textContent).toBe('Gefahren');
});
