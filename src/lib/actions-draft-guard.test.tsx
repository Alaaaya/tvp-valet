// @vitest-environment jsdom
import React from 'react';
// This suite exercises dismissal, not locale wording.
vi.mock('./i18n',async importOriginal=>({...await importOriginal<typeof import('./i18n')>(),t:(key:string)=>key}));
import {createRoot} from 'react-dom/client';
import {act} from 'react';
import {describe,expect,it,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import BookingActionsSheet from './booking-actions-sheet';
import {blank} from '../model';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const bk={...blank(),code:'A1',plate:'AB1',spot:'5',status:'confirmed'} as any;
async function setup(extra:any={}){
 const {host,root}=mount();
 const onClose=vi.fn(),onChangeLocation=extra.onChangeLocation||vi.fn(async()=>{});
 await act(async()=>{root.render(<BookingActionsSheet booking={bk} onClose={onClose} onEditBooking={()=>{}} onChangeLocation={onChangeLocation}/>)});
 const click=async(el:Element|null)=>{await act(async()=>{(el as HTMLElement).dispatchEvent(new MouseEvent('click',{bubbles:true}))})};
 const items=()=>[...host.querySelectorAll('.bas-item')];
 await click(items().find(i=>i.textContent?.startsWith('Change location'))!);
 const input=host.querySelector('input[data-first]') as HTMLInputElement;
 await act(async()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;set.call(input,'12');input.dispatchEvent(new Event('input',{bubbles:true}))});
 return {host,click,onClose,root};
}
const mounted:{root:ReturnType<typeof createRoot>;host:HTMLElement}[]=[];
const mount=()=>{const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);mounted.push({root,host});return {host,root}};
afterEach(async()=>{for(const m of mounted.splice(0)){await act(async()=>{m.root.unmount()});m.host.remove()}vi.restoreAllMocks()});
describe('actions sheet location draft guard',()=>{
 for(const path of ['x','scrim','escape','cancel'] as const)it('declined confirm keeps draft via '+path,async()=>{
  const conf=vi.spyOn(window,'confirm').mockReturnValue(false);const s=await setup();
  const fire=async()=>{if(path==='x')await s.click(s.host.querySelector('.bas-x'));else if(path==='scrim')await s.click(s.host.querySelector('.bas-scrim'));else if(path==='cancel')await s.click([...s.host.querySelectorAll('.bas-btn')].find(b=>b.textContent==='Abbrechen')!);else await act(async()=>{s.host.querySelector('.bas')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))})};
  await fire();
  expect(conf).toHaveBeenCalledTimes(1);expect((s.host.querySelector('input[data-first]') as HTMLInputElement).value).toBe('12');expect(s.onClose).not.toHaveBeenCalled();
  conf.mockReturnValue(true);await fire();expect(s.host.querySelector('input[data-first]')).toBeNull();
 });
 it('untouched form leaves without prompt',async()=>{const conf=vi.spyOn(window,'confirm');const {host,root}=mount();
  await act(async()=>{root.render(<BookingActionsSheet booking={bk} onClose={()=>{}} onEditBooking={()=>{}} onChangeLocation={async()=>{}}/>)});
  await act(async()=>{[...host.querySelectorAll('.bas-item')].find(i=>i.textContent?.startsWith('Change location'))!.dispatchEvent(new MouseEvent('click',{bubbles:true}))});
  await act(async()=>{host.querySelector('.bas-x')!.dispatchEvent(new MouseEvent('click',{bubbles:true}))});expect(conf).not.toHaveBeenCalled()});
 it('no dismissal while saving',async()=>{
  let release!:()=>void;const slow=vi.fn(()=>new Promise<void>(r=>{release=r}));vi.spyOn(window,'confirm').mockReturnValue(true);
  const s=await setup({onChangeLocation:slow});
  await act(async()=>{s.host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
  expect(slow).toHaveBeenCalled();
  await s.click(s.host.querySelector('.bas-scrim'));await act(async()=>{s.host.querySelector('.bas')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))});
  expect(s.onClose).not.toHaveBeenCalled();expect(s.host.querySelector('input[data-first]')).not.toBeNull();
  await act(async()=>{release()});expect(s.onClose).toHaveBeenCalled();
 });
 it('all paths use one guarded back()',()=>{const src=readFileSync('src/lib/booking-actions-sheet.tsx','utf8');expect(src).not.toMatch(/onClick=\{back\}/);expect(src.match(/Ungespeicherten Standort verwerfen/g)).toHaveLength(1)});
});
