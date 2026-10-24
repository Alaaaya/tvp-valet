// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./camera',()=>({CameraScreen:()=>null,useObjectUrls:()=>new Map()}));
import {MultiCapture} from './multi-capture';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const img=(n:string)=>new File(['x'],n,{type:'image/jpeg'});
let host:HTMLElement,root:Root;
const mount=(key:string,send:(f:File)=>Promise<void>,up=()=>{})=>act(async()=>{root.render(<MultiCapture disabled={false} sessionKey={key} send={send} onUploaded={up}/>)});
const tick=(ms=20)=>act(async()=>{await new Promise(r=>setTimeout(r,ms))});
async function pick(files:File[]){await act(async()=>{(host.querySelector('button.upload') as HTMLElement).click()});
 const input=host.querySelector('input[type=file]') as HTMLInputElement;Object.defineProperty(input,'files',{value:files,configurable:true});await act(async()=>{input.dispatchEvent(new Event('change',{bubbles:true}))});}
beforeEach(()=>{(URL as any).createObjectURL=()=>'blob:x';(URL as any).revokeObjectURL=()=>{};host=document.createElement('div');document.body.appendChild(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove()});
describe('MultiCapture gallery multi-select',()=>{
 it('uploads all selected files then reports uploaded',async()=>{const sent:string[]=[],up=vi.fn();await mount('a',async f=>{sent.push(f.name)},up);
  await pick([img('1.jpg'),img('2.jpg'),img('3.jpg')]);await tick();expect(sent).toEqual(['1.jpg','2.jpg','3.jpg']);expect(up).toHaveBeenCalled()});
 it('partial failure keeps failed and retry does not duplicate',async()=>{const sent:string[]=[];let fail=true;await mount('a',async f=>{if(f.name==='2.jpg'&&fail)throw Error('x');sent.push(f.name)});
  await pick([img('1.jpg'),img('2.jpg'),img('3.jpg')]);await tick();expect(sent).toEqual(['1.jpg','3.jpg']);
  const retry=Array.from(host.querySelectorAll('button.mc-retry')).find(b=>/versuchen|Try again/.test(b.textContent||'')) as HTMLElement;expect(retry).toBeTruthy();
  fail=false;await act(async()=>{retry.click()});await tick();expect(sent).toEqual(['1.jpg','3.jpg','2.jpg'])});
 it('rejects unsupported types',async()=>{const send=vi.fn();await mount('a',send);await pick([new File(['x'],'a.svg',{type:'image/svg+xml'})]);await tick();expect(send).not.toHaveBeenCalled()});
 it('account switch drops the queue and stops uploading',async()=>{let release=()=>{};const sent:string[]=[];await mount('a',f=>new Promise<void>(r=>{release=()=>{sent.push(f.name);r()}}));
  await pick([img('1.jpg'),img('2.jpg')]);await tick();
  await mount('b',async()=>{});await act(async()=>{release()});await tick();expect(sent).toEqual(['1.jpg']);expect(host.querySelector('.mc-q')).toBeNull()});
});
