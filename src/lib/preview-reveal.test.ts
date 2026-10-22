// @vitest-environment jsdom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {watchPreviewReveal,dimsStable,coverSize} from './preview-reveal';
function vid(){const v=document.createElement('video');let d=[0,0];Object.defineProperty(v,'videoWidth',{get:()=>d[0]});Object.defineProperty(v,'videoHeight',{get:()=>d[1]});return{v,set:(w:number,h:number)=>{d=[w,h]}}}
beforeEach(()=>{vi.useFakeTimers();Object.defineProperty(window,'innerWidth',{configurable:true,value:390});Object.defineProperty(window,'innerHeight',{configurable:true,value:844})});
afterEach(()=>vi.useRealTimers());
describe('preview reveal',()=>{
  it('dims must match viewport orientation',()=>{expect(dimsStable(1920,1080,true)).toBe(false);expect(dimsStable(1080,1920,true)).toBe(true);expect(dimsStable(1920,1080,false)).toBe(true);expect(dimsStable(0,0,true)).toBe(false)});
  it('coverSize never sizes landscape on a portrait viewport',()=>{const c=coverSize(390,600,1920,1080,true)!;expect(c.h).toBeGreaterThanOrEqual(c.w);expect(c.w).toBeGreaterThanOrEqual(390);expect(c.h).toBeGreaterThanOrEqual(600);expect(coverSize(0,1,1,1)).toBeNull()});
  it('landscape first frame -> portrait resize -> waits 2 video frames, refits and repaints, then shows',()=>{
    const {v,set}=vid();const cbs:Array<()=>void>=[];(v as any).requestVideoFrameCallback=(cb:()=>void)=>{cbs.push(cb);return 1};
    const onShow=vi.fn(),fit=vi.fn();watchPreviewReveal(v,{fit,onShow});
    set(1920,1080);v.dispatchEvent(new Event('loadeddata'));v.dispatchEvent(new Event('playing'));
    expect(cbs.length).toBe(0);vi.advanceTimersByTime(200);expect(onShow).not.toHaveBeenCalled();
    set(1080,1920);v.dispatchEvent(new Event('resize'));expect(fit).toHaveBeenCalled();
    cbs.shift()!();expect(onShow).not.toHaveBeenCalled();cbs.shift()!();
    vi.advanceTimersByTime(20);expect(onShow).toHaveBeenCalledTimes(1);expect(v.style.objectFit).toBe('cover');
    v.dispatchEvent(new Event('resize'));vi.advanceTimersByTime(800);expect(onShow).toHaveBeenCalledTimes(1);
  });
  it('a resize during the settle window restarts it',()=>{
    const {v,set}=vid();const onShow=vi.fn();watchPreviewReveal(v,{onShow});
    set(1080,1920);v.dispatchEvent(new Event('loadedmetadata'));vi.advanceTimersByTime(100);
    set(720,1280);v.dispatchEvent(new Event('resize'));vi.advanceTimersByTime(100);expect(onShow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(80);expect(onShow).toHaveBeenCalledTimes(1);
  });
  it('hard cap ~700ms after playing; cleanup cancels everything',()=>{
    const a=vid();const s1=vi.fn();watchPreviewReveal(a.v,{onShow:s1});a.set(1920,1080);a.v.dispatchEvent(new Event('playing'));
    vi.advanceTimersByTime(690);expect(s1).not.toHaveBeenCalled();vi.advanceTimersByTime(40);expect(s1).toHaveBeenCalledTimes(1);
    const b=vid();const s2=vi.fn();const stop=watchPreviewReveal(b.v,{onShow:s2});b.set(1080,1920);b.v.dispatchEvent(new Event('playing'));stop();vi.advanceTimersByTime(2000);expect(s2).not.toHaveBeenCalled();
  });
  it('isLive false blocks reveal',()=>{const {v,set}=vid();const s=vi.fn();watchPreviewReveal(v,{onShow:s,isLive:()=>false});set(1080,1920);v.dispatchEvent(new Event('playing'));vi.advanceTimersByTime(2000);expect(s).not.toHaveBeenCalled()});
});
