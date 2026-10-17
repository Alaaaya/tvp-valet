import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {MAX_VIDEO_BYTES,validateVideoSize,validateVideoDuration,validateFallbackVideo} from './camera-validation';

describe('camera video constraints',()=>{
  it('accepts exact inclusive boundaries',()=>{
    expect(()=>validateVideoSize(MAX_VIDEO_BYTES)).not.toThrow();
    expect(()=>validateVideoDuration(120)).not.toThrow();
    expect(()=>validateVideoDuration(.001)).not.toThrow();
  });
  it.each([0,-1,NaN,Infinity,MAX_VIDEO_BYTES+1])('rejects invalid/oversize final blob %s',size=>expect(()=>validateVideoSize(size)).toThrow());
  it.each([0,-1,NaN,Infinity,120.001])('rejects invalid/long duration %s',duration=>expect(()=>validateVideoDuration(duration)).toThrow());
});

describe('fallback metadata probe',()=>{
  let video:{duration:number;onloadedmetadata:null|(()=>void);onerror:null|(()=>void);load:ReturnType<typeof vi.fn>;removeAttribute:ReturnType<typeof vi.fn>;src?:string};
  let create:ReturnType<typeof vi.fn<(obj:Blob|MediaSource)=>string>>,revoke:ReturnType<typeof vi.fn<(url:string)=>void>>;
  beforeEach(()=>{
    vi.useFakeTimers();
    video={duration:120,onloadedmetadata:null,onerror:null,load:vi.fn(),removeAttribute:vi.fn()};
    vi.stubGlobal('document',{createElement:vi.fn(()=>video)});
    create=vi.fn((_obj:Blob|MediaSource)=>'blob:probe');revoke=vi.fn((_url:string)=>{});
    vi.spyOn(URL,'createObjectURL').mockImplementation(create);
    vi.spyOn(URL,'revokeObjectURL').mockImplementation(revoke);
  });
  afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals()});
  const blob=()=>new Blob(['video'],{type:'video/mp4'});
  function cleaned(){
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:probe');
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.onloadedmetadata).toBeNull();expect(video.onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  }
  it('waits for metadata and releases the object URL on success',async()=>{
    const p=validateFallbackVideo(blob());expect(video.src).toBe('blob:probe');
    video.onloadedmetadata!();await expect(p).resolves.toBeUndefined();cleaned();
  });
  it.each([Infinity,NaN,0,-1,120.01])('rejects metadata duration %s and cleans up',async duration=>{
    video.duration=duration;const p=validateFallbackVideo(blob());
    video.onloadedmetadata!();await expect(p).rejects.toThrow();cleaned();
  });
  it('cleans up unreadable video',async()=>{
    const p=validateFallbackVideo(blob());video.onerror!();await expect(p).rejects.toThrow('nicht gelesen');cleaned();
  });
  it('rejects timed-out metadata and cleans up',async()=>{
    const p=validateFallbackVideo(blob()),result=expect(p).rejects.toThrow('rechtzeitig');
    await vi.advanceTimersByTimeAsync(10000);await result;cleaned();
  });
  it('rejects oversized files before creating any object URL',async()=>{
    await expect(validateFallbackVideo({size:MAX_VIDEO_BYTES+1} as Blob)).rejects.toThrow('45 MB');
    expect(create).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans up synchronous decoder setup failures',async()=>{
    video.load.mockImplementationOnce(()=>{throw Error('decoder failure')});
    await expect(validateFallbackVideo(blob())).rejects.toThrow('decoder failure');cleaned();
  });
});
