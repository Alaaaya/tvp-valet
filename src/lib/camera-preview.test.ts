// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import {startCameraPreview} from './camera-preview';
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers()});
describe('inline camera preview',()=>{
 it('sets attrs and properties on mounted video BEFORE srcObject and explicitly plays without waiting for metadata',async()=>{
  const v=document.createElement('video');document.body.append(v);const s={} as MediaStream;
  let attached:unknown;
  Object.defineProperty(v,'srcObject',{set(x){expect(v.isConnected).toBe(true);expect(v.muted&&v.defaultMuted&&v.playsInline&&v.autoplay).toBe(true);for(const n of ['playsinline','webkit-playsinline','muted','autoplay'])expect(v.hasAttribute(n)).toBe(true);attached=x},get(){return attached}});
  const play=vi.spyOn(v,'play').mockImplementation(async()=>{expect(attached).toBe(s)});
  await startCameraPreview(v,s,new AbortController().signal);expect(play).toHaveBeenCalledTimes(1);v.remove();
 });
 it('handles already available metadata without waiting for a lost event',async()=>{
  const v=document.createElement('video');Object.defineProperty(v,'readyState',{value:4});vi.spyOn(v,'play').mockResolvedValue();
  await startCameraPreview(v,{} as MediaStream,new AbortController().signal);
 });
 it('surfaces playback rejection',async()=>{
  const v=document.createElement('video');vi.spyOn(v,'play').mockRejectedValue(new DOMException('blocked','NotAllowedError'));
  await expect(startCameraPreview(v,{} as MediaStream,new AbortController().signal)).rejects.toThrow('blocked');
 });
 it('cancels pending playback and removes abort listener, late resolution is harmless',async()=>{
  const v=document.createElement('video'),c=new AbortController();let finish!:()=>void;
  vi.spyOn(v,'play').mockImplementation(()=>new Promise<void>(r=>{finish=r}));
  const remove=vi.spyOn(c.signal,'removeEventListener'),p=startCameraPreview(v,{} as MediaStream,c.signal);
  const assertion=expect(p).rejects.toMatchObject({name:'AbortError'});c.abort();await assertion;finish();expect(remove).toHaveBeenCalledWith('abort',expect.any(Function));
 });
 it('bounds a hung playback and cleans error listeners',async()=>{
  vi.useFakeTimers();const v=document.createElement('video');vi.spyOn(v,'play').mockImplementation(()=>new Promise(()=>{}));const remove=vi.spyOn(v,'removeEventListener');
  const p=startCameraPreview(v,{} as MediaStream,new AbortController().signal),assertion=expect(p).rejects.toThrow('timed out');await vi.advanceTimersByTimeAsync(12000);await assertion;expect(remove).toHaveBeenCalledWith('error',expect.any(Function));
 });
 it('does not attach after cancellation',async()=>{
  const v=document.createElement('video'),c=new AbortController();c.abort();const play=vi.spyOn(v,'play');
  await expect(startCameraPreview(v,{} as MediaStream,c.signal)).rejects.toMatchObject({name:'AbortError'});expect(play).not.toHaveBeenCalled();expect(v.srcObject).toBeUndefined();
 });
});
