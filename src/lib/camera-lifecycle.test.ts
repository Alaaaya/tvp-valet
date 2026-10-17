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
