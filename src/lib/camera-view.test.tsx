// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./handover-api',()=>({createPendingMedia:(blob:Blob,kind:string,name:string)=>({id:name,blob,kind,name})}));
vi.mock('./i18n',async importOriginal=>({...await importOriginal<typeof import('./i18n')>(),t:(k:string)=>k}));
import {__resetCameraForTests} from './camera-stream';
import {CameraScreen,CAM_VIEW_KEY} from './camera';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const fakeStream=()=>{const t:any={kind:'video',readyState:'live',stop:vi.fn(),getCapabilities:()=>({zoom:{min:1,max:4,step:.1},torch:true}),applyConstraints:vi.fn(async()=>{}),addEventListener:vi.fn()};return{getTracks:()=>[t],getVideoTracks:()=>[t],getAudioTracks:()=>[],track:t} as any};
let gum:any;
beforeEach(()=>{__resetCameraForTests();localStorage.clear();gum=vi.fn(async()=>fakeStream());(navigator as any).mediaDevices={getUserMedia:gum};
  (globalThis as any).MediaRecorder=class{static isTypeSupported(t:string){return t==='video/mp4'}};
  HTMLMediaElement.prototype.play=vi.fn(async()=>{}) as any;HTMLMediaElement.prototype.pause=vi.fn() as any});
afterEach(()=>__resetCameraForTests());
async function mount(media:any[]=[]){const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
  await act(async()=>{root.render(<CameraScreen title="Einchecken · D-AB 1" media={media} onAdd={()=>{}} onRemove={()=>{}} onBack={()=>{}} onDone={()=>{}}/>)});
  return{host,unmount:async()=>{await act(async()=>root.unmount());host.remove()}}}
const q=(h:HTMLElement,s:string)=>h.querySelector(s) as HTMLElement;
describe('camera normal / fullscreen view',()=>{
  it('defaults to the normal view: teal header with title, expand button, torch on the preview card, media section',async()=>{
    const m=await mount();const cam=q(m.host,'.cam');expect(cam.classList.contains('fs')).toBe(false);
    expect(q(m.host,'.cam-title').textContent).toBe('Einchecken · D-AB 1');
    expect(q(m.host,'.cam-expand').getAttribute('aria-label')).toBe('Vollbild');
    expect(q(m.host,'.cam-stage .cam-torch')).toBeTruthy();
    expect(q(m.host,'.cam-media h3').textContent).toContain('Aufgenommene Medien');
    expect(q(m.host,'.cam-empty').textContent).toBe('Noch keine Medien aufgenommen.');
    expect(Array.from(m.host.querySelectorAll('button')).some(b=>b.textContent==='Fertig')).toBe(true);
    await m.unmount();
  });
  it('expand toggles fullscreen, moves torch to the top bar, remembers the choice; collapse returns',async()=>{
    const m=await mount();await act(async()=>q(m.host,'.cam-expand').click());
    expect(q(m.host,'.cam').classList.contains('fs')).toBe(true);expect(localStorage.getItem(CAM_VIEW_KEY)).toBe('1');
    expect(q(m.host,'.cam-top .cam-torch')).toBeTruthy();expect(q(m.host,'.cam-media')).toBeNull();
    expect(q(m.host,'.cam-status').textContent).toBe('Noch keine Medien aufgenommen.');
    expect(gum).toHaveBeenCalledTimes(1);
    await m.unmount();
    const m2=await mount();expect(q(m2.host,'.cam').classList.contains('fs')).toBe(true);
    await act(async()=>q(m2.host,'.cam-expand').click());expect(q(m2.host,'.cam').classList.contains('fs')).toBe(false);
    expect(localStorage.getItem(CAM_VIEW_KEY)).toBe('0');await m2.unmount();
  });
  it('zoom reset chip applies zoom 1 via applyConstraints',async()=>{
    const m=await mount();const s=await gum.mock.results[0].value;
    await act(async()=>q(m.host,'.cam-1x').click());
    expect(s.track.applyConstraints).toHaveBeenCalledWith({advanced:[{zoom:1}]});await m.unmount();
  });
  it('captured media shows a count and thumbnails',async()=>{
    const media=[{id:'a',blob:new Blob(['x']),kind:'photo',name:'a'}];(URL as any).createObjectURL=()=>'blob:x';(URL as any).revokeObjectURL=()=>{};
    const m=await mount(media);expect(q(m.host,'.cam-media h3 small').textContent).toBe('1 / 40');expect(m.host.querySelectorAll('.cam-media .cam-thumb').length).toBe(1);await m.unmount();
  });
  it('css: solid teal header, navy page, rounded preview card, fullscreen edge to edge',()=>{
    const css=readFileSync('src/handover.css','utf8');
    expect(css).toMatch(/\.cam-top\{[^}]*background:#0d6b6b/);expect(css).toMatch(/\.cam\{[^}]*background:#141a2e/);
    expect(css).toMatch(/\.cam-stage\{[^}]*border-radius:14px/);expect(css).toMatch(/\.cam\.fs \.cam-stage\{[^}]*left:0;right:0;bottom:0;margin:0/);
  });
});
