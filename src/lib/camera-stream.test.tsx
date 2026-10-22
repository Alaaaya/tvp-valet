// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./handover-api',()=>({createPendingMedia:(blob:Blob,kind:string,name:string)=>({id:name,blob,kind,name})}));
vi.mock('./i18n',async importOriginal=>({...await importOriginal<typeof import('./i18n')>(),t:(k:string)=>k}));
import {acquireCamera,releaseCamera,stopCameraNow,CAMERA_CONSTRAINTS,__resetCameraForTests} from './camera-stream';
import {CameraScreen} from './camera';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

function fakeTrack(){const t:any={kind:'video',readyState:'live',enabled:true,stop:vi.fn(()=>{t.readyState='ended'}),getCapabilities:()=>({}),applyConstraints:vi.fn(async()=>{}),addEventListener:vi.fn()};return t}
function fakeStream(){const v=fakeTrack();return{getTracks:()=>[v],getVideoTracks:()=>[v],getAudioTracks:()=>[],track:v} as any}
let gum:ReturnType<typeof vi.fn>;
beforeEach(()=>{__resetCameraForTests();gum=vi.fn(async()=>fakeStream());(navigator as any).mediaDevices={getUserMedia:gum};
  (globalThis as any).MediaRecorder=class{static isTypeSupported(t:string){return t==='video/mp4'}};
  HTMLMediaElement.prototype.play=vi.fn(async()=>{}) as any;HTMLMediaElement.prototype.pause=vi.fn() as any;});
afterEach(()=>{vi.useRealTimers();__resetCameraForTests()});

describe('shared camera stream',()=>{
  it('asks for video only (one camera prompt, no microphone prompt)',()=>{expect(CAMERA_CONSTRAINTS.audio).toBe(false);expect(CAMERA_CONSTRAINTS.video).toBeTruthy()});
  it('closing (last release) stops all tracks immediately: no lingering iOS camera indicator',async()=>{
    const a:any=await acquireCamera();releaseCamera();
    expect(a.track.stop).toHaveBeenCalled();
    const b:any=await acquireCamera();expect(b).not.toBe(a);expect(gum).toHaveBeenCalledTimes(2);
  });
  it('no idle keep-alive timer is left running',async()=>{
    vi.useFakeTimers();const a:any=await acquireCamera();releaseCamera();expect(a.track.stop).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
  });
  it('concurrent acquires share one getUserMedia call; stream lives until the last user releases',async()=>{
    const [a,b]=await Promise.all([acquireCamera(),acquireCamera()]) as any[];expect(a).toBe(b);expect(gum).toHaveBeenCalledTimes(1);
    releaseCamera();expect(a.track.stop).not.toHaveBeenCalled();releaseCamera();expect(a.track.stop).toHaveBeenCalled();
  });
  it('a request that resolves after every screen closed is stopped at once',async()=>{
    let res:(s:any)=>void=()=>{};gum.mockImplementationOnce(()=>new Promise(r=>{res=r}));
    const p=acquireCamera();releaseCamera();const s=fakeStream();res(s);
    await expect(p).rejects.toBeTruthy();expect(s.track.stop).toHaveBeenCalled();
  });
  it('page hidden or pagehide stops the tracks',async()=>{
    const a:any=await acquireCamera();
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));expect(a.track.stop).toHaveBeenCalled();
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});
    releaseCamera();const b:any=await acquireCamera();window.dispatchEvent(new Event('pagehide'));expect(b.track.stop).toHaveBeenCalled();
  });
  it('requests again when iOS ended the track',async()=>{
    const a:any=await acquireCamera();a.track.readyState='ended';
    const b:any=await acquireCamera();expect(b).not.toBe(a);expect(gum).toHaveBeenCalledTimes(2);
  });
  it('a denied request can be retried',async()=>{
    gum.mockRejectedValueOnce(Object.assign(new Error('x'),{name:'NotAllowedError'}));
    await expect(acquireCamera()).rejects.toBeTruthy();await acquireCamera();expect(gum).toHaveBeenCalledTimes(2);
  });
  it('stopCameraNow releases hardware',async()=>{const a:any=await acquireCamera();stopCameraNow();expect(a.track.stop).toHaveBeenCalled()});
});

describe('CameraScreen uses the shared stream',()=>{
  async function mount(){const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
    await act(async()=>{root.render(<CameraScreen title="Einchecken · X" media={[]} onAdd={()=>{}} onRemove={()=>{}} onBack={()=>{}} onDone={()=>{}}/>)});
    return{host,unmount:async()=>{await act(async()=>root.unmount());host.remove()}}}
  it('closing the camera screen stops all tracks (hardware released)',async()=>{
    const m1=await mount();expect(gum).toHaveBeenCalledTimes(1);const s=await gum.mock.results[0].value;
    expect(s.track.stop).not.toHaveBeenCalled();await m1.unmount();
    expect(s.track.stop).toHaveBeenCalled();
  });
  it('switching Photo -> Video -> Photo does not call getUserMedia again',async()=>{
    const m=await mount();const tabs=m.host.querySelectorAll('.cam-modes button');
    await act(async()=>{(tabs[1] as HTMLElement).click()});await act(async()=>{(tabs[0] as HTMLElement).click()});
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');expect(gum).toHaveBeenCalledTimes(1);
    expect(gum.mock.calls[0][0].audio).toBe(false);await m.unmount();
  });
  it('preview sits in a stage between top bar and controls',async()=>{
    const m=await mount();expect(m.host.querySelector('.cam-stage .cam-video')).toBeTruthy();await m.unmount();
  });
  it('preview is full-size via CSS and hidden until the first frame, then shown',async()=>{
    const css=(await import('node:fs')).readFileSync('src/handover.css','utf8');
    expect(css).toMatch(/\.cam-video\{position:absolute;inset:0;[^}]*width:100%;height:100%;min-width:100%;min-height:100%;[^}]*object-fit:cover;[^}]*opacity:0\}/);
    expect(css).toContain('.cam-video.is-shown{opacity:1}');
    const m=await mount();const v=m.host.querySelector('.cam-video') as HTMLVideoElement;
    expect(v.classList.contains('is-shown')).toBe(false);
    await act(async()=>{v.dispatchEvent(new Event('playing'))});
    expect(v.classList.contains('is-shown')).toBe(true);
    await m.unmount();
  });
});
