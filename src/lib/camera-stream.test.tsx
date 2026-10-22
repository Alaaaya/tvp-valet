// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./handover-api',()=>({createPendingMedia:(blob:Blob,kind:string,name:string)=>({id:name,blob,kind,name})}));
vi.mock('./i18n',async importOriginal=>({...await importOriginal<typeof import('./i18n')>(),t:(k:string)=>k}));
import {acquireCamera,releaseCamera,stopCameraNow,CAMERA_IDLE_MS,CAMERA_CONSTRAINTS,__resetCameraForTests} from './camera-stream';
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
  it('reuses the live stream after release without calling getUserMedia again',async()=>{
    const a:any=await acquireCamera();releaseCamera();
    expect(a.track.stop).not.toHaveBeenCalled();expect(a.track.enabled).toBe(false);
    const b:any=await acquireCamera();expect(b).toBe(a);expect(b.track.enabled).toBe(true);expect(gum).toHaveBeenCalledTimes(1);
  });
  it('concurrent acquires share one getUserMedia call',async()=>{
    const [a,b]=await Promise.all([acquireCamera(),acquireCamera()]);expect(a).toBe(b);expect(gum).toHaveBeenCalledTimes(1);
  });
  it('stops the hardware only after the idle timeout',async()=>{
    vi.useFakeTimers();const a:any=await acquireCamera();releaseCamera();
    vi.advanceTimersByTime(CAMERA_IDLE_MS-1000);expect(a.track.stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);expect(a.track.stop).toHaveBeenCalled();
    await acquireCamera();expect(gum).toHaveBeenCalledTimes(2);
  });
  it('re-acquiring before the timeout cancels the stop',async()=>{
    vi.useFakeTimers();const a:any=await acquireCamera();releaseCamera();vi.advanceTimersByTime(CAMERA_IDLE_MS/2);
    await acquireCamera();vi.advanceTimersByTime(CAMERA_IDLE_MS*2);expect(a.track.stop).not.toHaveBeenCalled();
  });
  it('requests again when iOS ended the track',async()=>{
    const a:any=await acquireCamera();releaseCamera();a.track.readyState='ended';
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
  it('second open does not call getUserMedia again and closing does not stop tracks',async()=>{
    const m1=await mount();expect(gum).toHaveBeenCalledTimes(1);const s=await gum.mock.results[0].value;await m1.unmount();
    expect(s.track.stop).not.toHaveBeenCalled();
    const m2=await mount();expect(gum).toHaveBeenCalledTimes(1);await m2.unmount();
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
});
