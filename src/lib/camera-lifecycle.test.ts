import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const source=readFileSync(new URL('./camera.tsx',import.meta.url),'utf8');
describe('camera async lifecycle source guards',()=>{
  it('invalidates pending permissions before stopping a hidden camera',()=>{
    expect(source).toMatch(/visibilityState==='hidden'\)\{gen.current\+\+;stopRecorder\(false\);stopStream\(\)/);
  });
  it('checks generation and mount before video-only permission fallback',()=>{
    expect(source).toMatch(/if\(!s\)\{if\(my!==gen.current\|\|!mounted.current\)return;s=await navigator.mediaDevices.getUserMedia\(\{video:base,audio:false\}\)/);
  });
  it('stops every stale resolved track before adopting the stream',()=>{
    expect(source).toMatch(/if\(my!==gen.current\|\|!mounted.current\)\{s.getTracks\(\).forEach\(t=>t.stop\(\)\);return\}\s*stream.current=s/);
  });
  it('stops an existing stream before awaiting new permissions',()=>{
    const start=source.slice(source.indexOf('const start=useCallback'));
    expect(start.indexOf('stopStream();')).toBeLessThan(start.indexOf('await navigator.mediaDevices.getUserMedia'));
    expect(source).toContain('mounted.current=false;gen.current++;');
  });
});

describe('recorder final payload source guards',()=>{
  const stop=source.slice(source.indexOf('const stopRecorder='),source.indexOf('const start='));
  const onstop=source.slice(source.indexOf('r.onstop=()=>'),source.indexOf('try{r.start(1000)}'));
  it('marks successful stops as finalizing before requesting asynchronous stop',()=>{
    expect(stop).toMatch(/if\(!drop\)\{finalizingRef.current=true;if\(mounted.current\)setFinalizing\(true\)\}/);
    expect(stop.indexOf('finalizingRef.current=true')).toBeLessThan(stop.indexOf('r.stop()'));
    expect(stop).not.toMatch(/\}\s*setRecording\(false\)/);
  });
  it('adds the final payload before releasing finalizing and recording',()=>{
    expect(onstop.indexOf('onAdd(createPendingMedia')).toBeGreaterThan(0);
    expect(onstop.indexOf('finally{')).toBeGreaterThan(onstop.indexOf('onAdd(createPendingMedia'));
    expect(onstop).toContain('finally{rec.current=null;finalizingRef.current=false;');
  });
  it('blocks done, mode changes, shutter restart and back while finalizing',()=>{
    expect(source).toContain('disabled={recording||finalizing} onClick={onDone}');
    expect(source).toContain('if(recording||finalizingRef.current||m===mode)return;');
    expect(source).toContain("async function toggleRecord(){\n    if(finalizingRef.current)return;");
    expect(source).toContain('disabled={!ready||finalizing}');
    expect(source).toContain('aria-label={tr("Zurück")} disabled={recording||finalizing}');
  });
  it('uses the same finalization path for size and duration auto-stop',()=>{
    expect(source).toContain('setNote(tr("Video auf 45 MB begrenzt."));stopRecorder(false)');
    expect(source).toContain('setNote(tr("Video auf 120 Sekunden begrenzt."));stopRecorder(false)');
  });
  it('releases error/discard state and detaches failed recorder callbacks',()=>{
    expect(stop).toContain('if(drop){discard.current=true;chunks.current=[];finalizingRef.current=false;');
    expect(source).toContain('r.ondataavailable=null;r.onstop=null;');
    expect(source).toContain('rec.current=null;chunks.current=[];finalizingRef.current=false;');
  });
});
