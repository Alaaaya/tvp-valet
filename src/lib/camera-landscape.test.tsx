// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./handover-api',()=>({createPendingMedia:(blob:Blob,kind:string,name:string)=>({id:name,blob,kind,name})}));
vi.mock('./i18n',async importOriginal=>({...await importOriginal<typeof import('./i18n')>(),t:(k:string)=>k}));
import {__resetCameraForTests} from './camera-stream';
import {CameraScreen} from './camera';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

const css=readFileSync('src/handover.css','utf8');
const land=(()=>{const i=css.indexOf('@media (orientation:landscape){');expect(i).toBeGreaterThan(-1);return css.slice(i,css.indexOf('\n}\n',i))})();
const portrait=css.slice(0,css.indexOf('@media (orientation:landscape){'));
const rule=(src:string,sel:string)=>{const i=src.indexOf(sel+'{');expect(i,sel).toBeGreaterThan(-1);return src.slice(i,src.indexOf('}',i))};

describe('camera landscape layout (CSS)',()=>{
  it('portrait base layout is unchanged: column of top bar, stage, bottom controls',()=>{
    expect(rule(portrait,'.cam')).toContain('display:flex;flex-direction:column');
    expect(rule(portrait,'.cam-stage')).toContain('flex:1 1 auto');
    expect(rule(portrait,'.cam-bottom')).toContain('order:2');
  });
  it('preview fills the whole screen in landscape',()=>{
    expect(rule(land,'.cam.cam')).toContain('display:block');
    expect(rule(land,'.cam .cam-stage')).toMatch(/position:absolute;inset:0/);
  });
  it('top bar is overlaid and respects the notch sides',()=>{
    const t=rule(land,'.cam .cam-top');expect(t).toContain('position:absolute');
    expect(t).toContain('env(safe-area-inset-left)');expect(t).toContain('env(safe-area-inset-top)');expect(t).toContain('right:var(--cam-col)');
  });
  it('controls are a right-hand column: Done, shutter, Photo/Video, status',()=>{
    const b=rule(land,'.cam .cam-bottom');expect(b).toMatch(/position:absolute;top:0;right:0;bottom:0/);expect(b).toContain('env(safe-area-inset-right)');
    expect(rule(land,'.cam .cam-row')).toContain('display:contents');
    const ord=(s:string)=>+rule(land,s).match(/order:(\d)/)![1];
    expect(ord('.cam .cam-pill.blue')).toBeLessThan(ord('.cam .cam-shutter'));
    expect(ord('.cam .cam-shutter')).toBeLessThan(ord('.cam .cam-modes'));
    expect(ord('.cam .cam-modes')).toBeLessThan(ord('.cam .cam-status'));
  });
  it('zoom is a compact panel beside the column, at the bottom edge',()=>{
    const z=rule(land,'.cam .cam-zoom');expect(z).toContain('position:absolute');expect(z).toContain('right:calc(var(--cam-col)');expect(z).toContain('bottom:');expect(z).toContain('flex-wrap:nowrap');
  });
  it('landscape block stays solid (no translucency)',()=>{expect(land).not.toMatch(/rgba\(|hsla\(|blur\(|backdrop|opacity:\.[0-9]/)});
  it('QR scanner viewfinder fits a landscape phone screen',()=>{
    const s=readFileSync('src/booking-scan.css','utf8');const i=s.indexOf('@media (orientation:landscape)');expect(i).toBeGreaterThan(-1);
    const b=s.slice(i);expect(b).toContain('.bsc .bsc-view{aspect-ratio:auto;height:');expect(b).toContain('env(safe-area-inset-left)');
  });
});

function fakeTrack(){return{kind:'video',readyState:'live',enabled:true,stop:vi.fn(),getCapabilities:()=>({}),applyConstraints:vi.fn(async()=>{}),addEventListener:vi.fn()} as any}
function fakeStream(){const v=fakeTrack();return{getTracks:()=>[v],getVideoTracks:()=>[v],getAudioTracks:()=>[]} as any}
let gum:ReturnType<typeof vi.fn>;
beforeEach(()=>{__resetCameraForTests();gum=vi.fn(async()=>fakeStream());(navigator as any).mediaDevices={getUserMedia:gum};
  (globalThis as any).MediaRecorder=class{static isTypeSupported(t:string){return t==='video/mp4'}};
  HTMLMediaElement.prototype.play=vi.fn(async()=>{}) as any;HTMLMediaElement.prototype.pause=vi.fn() as any;});
afterEach(()=>__resetCameraForTests());

describe('rotation keeps the stream',()=>{
  it('resize/orientationchange refit the preview without a new getUserMedia call',async()=>{
    const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
    await act(async()=>{root.render(<CameraScreen title="t" media={[]} onAdd={()=>{}} onRemove={()=>{}} onBack={()=>{}} onDone={()=>{}}/>)});
    await act(async()=>{});expect(gum).toHaveBeenCalledTimes(1);
    const v=host.querySelector('.cam-video') as HTMLVideoElement;const src=v.srcObject;
    await act(async()=>{window.dispatchEvent(new Event('orientationchange'));window.dispatchEvent(new Event('resize'))});
    expect(gum).toHaveBeenCalledTimes(1);expect(v.srcObject).toBe(src);expect(host.querySelector('.cam-video')).toBe(v);
    await act(async()=>root.unmount());host.remove();
  });
});
