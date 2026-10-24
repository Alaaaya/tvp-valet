// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({decode:vi.fn()}));
vi.mock('./booking-scan-qr',async importOriginal=>({...await importOriginal<object>(),createQrDecoder:async()=>({decode:async()=>null}),decodeQrFromFile:mocks.decode}));
vi.mock('./camera-stream',()=>({acquireCamera:async()=>{throw new DOMException('denied','NotAllowedError')},releaseCamera:vi.fn(),prewarmCamera:vi.fn(),cancelPrewarm:vi.fn()}));
import {MainScanner} from './main-scanner';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root,host:HTMLElement,lookup:ReturnType<typeof vi.fn<(r:import('./main-scanner').ScanLookup)=>void>>;
const jobs:{resolve:(s:string|null)=>void;reject:(e:Error)=>void}[]=[];
const click=async(s:string)=>act(async()=>{(document.querySelector(s) as HTMLElement).click()});
async function open(){await act(async()=>root.render(<MainScanner onLookup={lookup} onPlate={()=>{}} onClose={()=>root.render(null)}/>));await click('.ms-item')}
async function pick(valid=true){const input=document.querySelector('.ms-qr input[type=file]') as HTMLInputElement;Object.defineProperty(input,'files',{value:[new File(['x'],valid?'qr.png':'bad.txt',{type:valid?'image/png':'text/plain'})],configurable:true});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})))}
async function finish(i:number,value:string|null,error=false){await act(async()=>{error?jobs[i].reject(Error(value!)):jobs[i].resolve(value)})}
beforeEach(async()=>{jobs.length=0;mocks.decode.mockReset().mockImplementation(()=>new Promise((resolve,reject)=>jobs.push({resolve,reject})));Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:vi.fn()},configurable:true});vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});host=document.createElement('div');document.body.append(host);root=createRoot(host);lookup=vi.fn();await open()});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks()});
it('new photo wins over old success arriving first',async()=>{await pick();await pick();await finish(0,'AF-AAAAAA');expect(lookup).not.toHaveBeenCalled();await finish(1,'AF-BBBBBB');expect(lookup).toHaveBeenCalledExactlyOnceWith({kind:'qr',value:'AF-BBBBBB'})});
it('old error cannot overwrite newer no-QR feedback',async()=>{await pick();await pick();await finish(1,null);const text=document.querySelector('.ms-err')!.textContent;await finish(0,'stale-error',true);expect(document.querySelector('.ms-err')!.textContent).toBe(text);expect(lookup).not.toHaveBeenCalled()});
it('older success cannot win after newer empty result',async()=>{await pick();await pick();await finish(1,null);await finish(0,'AF-AAAAAA');expect(lookup).not.toHaveBeenCalled()});
it('invalid latest file supersedes pending valid file',async()=>{await pick();await pick(false);const text=document.querySelector('.ms-err')!.textContent;await finish(0,'AF-AAAAAA');expect(lookup).not.toHaveBeenCalled();expect(document.querySelector('.ms-err')!.textContent).toBe(text)});
it('new selection clears previous feedback while pending',async()=>{await pick();await finish(0,null);await pick();expect(document.querySelector('.ms-qr .ms-err')!.textContent).not.toContain('Kein QR-Code')});
it('manual acceptance invalidates pending success and error',async()=>{await pick();await pick();const input=document.querySelector('.ms-fallback form input') as HTMLInputElement;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'AF-CCCCCC');input.dispatchEvent(new Event('input',{bubbles:true}))});await act(async()=>document.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));await finish(0,'AF-AAAAAA');await finish(1,'late-error',true);expect(lookup).toHaveBeenCalledExactlyOnceWith({kind:'qr',value:'AF-CCCCCC'});expect(document.body.textContent).not.toContain('late-error')});
it('close/unmount prevents late lookup and error',async()=>{await pick();await pick();await click('.ms-qr .ms-bar-btn');await finish(0,'AF-AAAAAA');await finish(1,'late-error',true);expect(lookup).not.toHaveBeenCalled();expect(document.querySelector('.ms-qr')).toBeNull()});
it('back then reopen starts a separate generation',async()=>{await pick();await click('.ms-fallback > button:last-child');await click('.ms-item');await pick();await finish(0,'AF-AAAAAA');expect(lookup).not.toHaveBeenCalled();await finish(1,'AF-BBBBBB');expect(lookup).toHaveBeenCalledExactlyOnceWith({kind:'qr',value:'AF-BBBBBB'})});
it('parent session or route unmount prevents stale result after reopening',async()=>{await pick();await act(async()=>root.render(null));await open();await pick();await finish(0,'AF-AAAAAA');expect(lookup).not.toHaveBeenCalled();await finish(1,'AF-BBBBBB');expect(lookup).toHaveBeenCalledExactlyOnceWith({kind:'qr',value:'AF-BBBBBB'})});
