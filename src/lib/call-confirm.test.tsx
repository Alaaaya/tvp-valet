// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it,vi} from 'vitest';
import {CallConfirm} from './call-confirm';
import {setLanguage} from './i18n';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>,host:HTMLDivElement;
afterEach(async()=>{if(root){await act(async()=>root.unmount());host.remove()}setLanguage('de')});
async function mount(busy=false){host=document.createElement('div');document.body.append(host);root=createRoot(host);const close=vi.fn(),clear=vi.fn();await act(async()=>root.render(<CallConfirm calledAt="2026-10-20T08:00:00Z" busy={busy} stale={false} retry={false} error="" canClear onClear={clear} onRepeat={()=>{}} onClose={close}/>));return{close,clear}}
it('focuses cancel and traps Tab in published clear-repeat-cancel order',async()=>{
 await mount();const b=Array.from(document.querySelectorAll('.call-ask button'));expect(document.activeElement).toBe(b[2]);
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));expect(document.activeElement).toBe(b[0]);
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));expect(document.activeElement).toBe(b[2]);
});
it('Escape closes only when not busy',async()=>{const {close}=await mount();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(close).toHaveBeenCalledTimes(1)});
it('busy Escape is blocked and buttons cannot submit',async()=>{const {close}=await mount(true);document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(close).not.toHaveBeenCalled();expect(Array.from(document.querySelectorAll('.call-ask button')).every(b=>(b as HTMLButtonElement).disabled)).toBe(true)});
it.each(['de','en','ar'] as const)('published confirmation has translated actions in %s',async(lang)=>{setLanguage(lang);await mount();const texts=Array.from(document.querySelectorAll('.call-ask button')).map(b=>b.textContent);expect(texts[0]).toBe(lang==='ar'?'حذف المكالمة':lang==='en'?'Delete call':'Anruf löschen');expect(texts).toHaveLength(3)});
