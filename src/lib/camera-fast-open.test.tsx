// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./handover-api',()=>({createPendingMedia:(blob:Blob,kind:string,name:string)=>({id:name,blob,kind,name})}));
vi.mock('./i18n',async importOriginal=>({...await importOriginal<typeof import('./i18n')>(),t:(k:string)=>k}));
import {acquireCamera,releaseCamera,prewarmCamera,cancelPrewarm,PREWARM_GRACE_MS,__resetCameraForTests} from './camera-stream';
import {CameraScreen} from './camera';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

function fakeTrack(order:string[]){const t:any={kind:'video',readyState:'live',enabled:true,stop:vi.fn(()=>{t.readyState='ended'}),getCapabilities:vi.fn(()=>{order.push('getCapabilities');return{}}),applyConstraints:vi.fn(async()=>{order.push('applyConstraints')}),addEventListener:vi.fn()};return t}
function fakeStream(order:string[]){const v=fakeTrack(order);return{getTracks:()=>[v],getVideoTracks:()=>[v],getAudioTracks:()=>[],track:v} as any}
let gum:ReturnType<typeof vi.fn>,order:string[],enumerate:ReturnType<typeof vi.fn>,perms:ReturnType<typeof vi.fn>;
beforeEach(()=>{__resetCameraForTests();order=[];
  gum=vi.fn(async()=>{order.push('getUserMedia');return fakeStream(order)});
  enumerate=vi.fn(async()=>{order.push('enumerateDevices');return[]});perms=vi.fn(async()=>{order.push('permissions');return{state:'granted'}});
  (navigator as any).mediaDevices={getUserMedia:gum,enumerateDevices:enumerate};(navigator as any).permissions={query:perms};
  (globalThis as any).MediaRecorder=class{static isTypeSupported(t:string){return t==='video/mp4'}};
  HTMLMediaElement.prototype.play=vi.fn(async function(this:HTMLVideoElement){order.push(this.srcObject?'play(with stream)':'play(empty)')}) as any;HTMLMediaElement.prototype.pause=vi.fn() as any;});
afterEach(()=>{vi.useRealTimers();__resetCameraForTests()});

describe('fast camera open',()=>{
  it('prewarm calls getUserMedia synchronously in the tap handler (same user gesture)',()=>{
    prewarmCamera();expect(gum).toHaveBeenCalledTimes(1);
  });
  it('getUserMedia uses simple constraints (no exact / deviceId) and nothing is awaited before it',()=>{
    prewarmCamera();const c=gum.mock.calls[0][0];const j=JSON.stringify(c);
    expect(j).not.toMatch(/exact|deviceId/);expect(c.video.facingMode).toEqual({ideal:'environment'});expect(c.audio).toBe(false);
    expect(order[0]).toBe('getUserMedia');expect(enumerate).not.toHaveBeenCalled();expect(perms).not.toHaveBeenCalled();
  });
  it('the screen joins the prewarmed request instead of starting a second one',async()=>{
    prewarmCamera();const s=await acquireCamera();expect(gum).toHaveBeenCalledTimes(1);expect(s).toBeTruthy();releaseCamera();
    expect((s as any).track.stop).toHaveBeenCalled();
  });
  it('a prewarm that never reaches a screen is stopped after the grace period (no lingering indicator)',async()=>{
    vi.useFakeTimers();prewarmCamera();const s:any=await gum.mock.results[0].value;await Promise.resolve();await Promise.resolve();
    expect(s.track.stop).not.toHaveBeenCalled();vi.advanceTimersByTime(PREWARM_GRACE_MS+1);expect(s.track.stop).toHaveBeenCalled();
  });
  it('cancelPrewarm stops a prewarmed stream, also one still in flight',async()=>{
    let res:(s:any)=>void=()=>{};gum.mockImplementationOnce(()=>new Promise(r=>{res=r}));
    prewarmCamera();cancelPrewarm();const s=fakeStream(order);res(s);await new Promise(r=>setTimeout(r,0));
    expect(s.track.stop).toHaveBeenCalled();
  });
  it('acquire clears the grace timer so an open screen is never stopped by it',async()=>{
    vi.useFakeTimers();prewarmCamera();const p=acquireCamera();const s:any=await p;vi.advanceTimersByTime(PREWARM_GRACE_MS*2);
    expect(s.track.stop).not.toHaveBeenCalled();releaseCamera();expect(s.track.stop).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
  });
  it('CameraScreen: getUserMedia starts during mount commit; stream attached and play() called before capabilities',async()=>{
    const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
    await act(async()=>{root.render(<CameraScreen title="t" media={[]} onAdd={()=>{}} onRemove={()=>{}} onBack={()=>{}} onDone={()=>{}}/>)});
    expect(order[0]).toBe('getUserMedia');
    expect(order.indexOf('play(with stream)')).toBeGreaterThan(0);
    expect(order.indexOf('play(with stream)')).toBeLessThan(order.indexOf('getCapabilities'));
    expect(order).not.toContain('applyConstraints');expect(order).not.toContain('play(empty)');
    const s=await gum.mock.results[0].value;await act(async()=>root.unmount());host.remove();
    expect(s.track.stop).toHaveBeenCalled();
  });
  it('CameraScreen after a tap prewarm: one getUserMedia, tracks stopped on close',async()=>{
    prewarmCamera();const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
    await act(async()=>{root.render(<CameraScreen title="t" media={[]} onAdd={()=>{}} onRemove={()=>{}} onBack={()=>{}} onDone={()=>{}}/>)});
    expect(gum).toHaveBeenCalledTimes(1);const s=await gum.mock.results[0].value;
    await act(async()=>root.unmount());host.remove();expect(s.track.stop).toHaveBeenCalled();
  });
});

describe('fast open wiring (source)',()=>{
  const main=readFileSync('src/main.tsx','utf8'),sheet=readFileSync('src/lib/main-scanner.tsx','utf8'),flow=readFileSync('src/lib/handover-flow.tsx','utf8');
  it('Einchecken/Auschecken tap prewarms the camera right before opening the flow',()=>{expect(main).toContain('prewarmCamera();setFlow({b,action:k})')});
  it('back to camera prewarms',()=>{expect(flow).toContain("prewarmCamera();setStep('camera')")});
  it('QR menu tap prewarms; sheet close and plate view cancel the prewarm',()=>{
    expect(sheet).toContain("onClick={()=>{prewarmCamera();setView('qr')}}");expect(sheet).toContain("cancelPrewarm();setView('plate')");expect(sheet).toMatch(/return\(\)=>\{cancelPrewarm\(\);/);
  });
  it('QR decoder is created in parallel, not awaited before the preview',()=>{
    expect(sheet).not.toContain('await createQrDecoder()');
    expect(sheet).toContain('createQrDecoder().then');
  });
  it('scanner chunk is preloaded on idle and on tap',()=>{expect(main).toContain('requestIdleCallback(pre');expect(main).toContain('void loadScanSheet();setScanOpen(true)')});
  it('no camera code awaits enumerateDevices / permissions before getUserMedia',()=>{
    for(const f of ['src/lib/camera-stream.ts','src/lib/camera.tsx','src/lib/main-scanner.tsx']){const t=readFileSync(f,'utf8');expect(t).not.toMatch(/enumerateDevices|permissions\.query/)}
  });
});
