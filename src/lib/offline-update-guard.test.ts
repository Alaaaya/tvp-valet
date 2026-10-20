// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {protectedUpdateUi} from './use-build-updates';
import {registerOfflineShell} from './offline-shell';
afterEach(()=>{document.body.innerHTML=''});
describe('waiting offline update uses real closed/open menu state',()=>{
 async function setup(pending=false){
  const postMessage=vi.fn();
  const container={controller:{},addEventListener(){},register:async()=>({active:{},installing:null,waiting:{postMessage},addEventListener(){}})} as unknown as ServiceWorkerContainer;
  const control=await registerOfflineShell({container,baseUrl:'/',isBlocked:()=>pending||protectedUpdateUi(document)});
  return {control:control!,postMessage};
 }
 it('closed hidden menu allows explicit idle activation',async()=>{
  document.body.innerHTML='<aside role="dialog" hidden></aside>';
  const {control,postMessage}=await setup();
  expect(control.applyUpdate()).toBe(true);
  expect(postMessage).toHaveBeenCalledWith({type:'SKIP_WAITING'});
 });
 it.each(['<aside role="dialog"></aside>','<section role="dialog"></section>','<div role="alertdialog"></div>','<form></form>','<div class="ho-flow"></div>','<canvas></canvas>'])('open protected UI blocks activation %s',async(html)=>{
  document.body.innerHTML=html;
  const {control,postMessage}=await setup();
  expect(control.applyUpdate()).toBe(false);expect(postMessage).not.toHaveBeenCalled();
 });
 it('pending outbox blocks even with menu closed',async()=>{
  document.body.innerHTML='<aside role="dialog" hidden></aside>';
  const {control,postMessage}=await setup(true);
  expect(control.applyUpdate()).toBe(false);expect(postMessage).not.toHaveBeenCalled();
 });
 it('focused unsaved input blocks and releases only after focus leaves',async()=>{
  document.body.innerHTML='<aside role="dialog" hidden></aside><input><button>Done</button>';
  const {control,postMessage}=await setup();
  document.querySelector('input')!.focus();
  expect(control.applyUpdate()).toBe(false);expect(postMessage).not.toHaveBeenCalled();
  document.querySelector('button')!.focus();
  expect(control.applyUpdate()).toBe(true);
 });
});
