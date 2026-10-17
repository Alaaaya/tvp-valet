import {readFileSync} from 'node:fs';import {it,expect} from 'vitest';
const css=readFileSync(new URL('./handover.css',import.meta.url),'utf8');
const rule=(sel:string)=>{const i=css.indexOf(sel+'{');expect(i,sel).toBeGreaterThan(-1);return css.slice(i,css.indexOf('}',i))};
it('thumb delete hitbox is not clipped and does not reach neighbors',()=>{
 const s=rule('.cam-strip'),pad=s.match(/padding:(\d+)px (\d+)px/)!,gap=+s.match(/gap:(\d+)px/)![1];
 const ext=+rule('.cam-thumb button').match(/top:-(\d+)px/)![1];
 expect(+pad[1]).toBeGreaterThanOrEqual(ext+1);expect(+pad[2]).toBeGreaterThanOrEqual(ext+1);expect(gap).toBeGreaterThanOrEqual(ext+3);
});
it('handover controls are 44px',()=>{
 for(const s of['.cam-zoom button','.cam-modes button','.cam-thumb button','.ho-back','.gv-head .gv-round','.mg-retry,.gv-retry','.ho-scan','.cam-round','.gv-round','.gv-nav','.gv-fs'])expect(rule(s)).toMatch(/(min-)?(height|width):44px/);
 expect(rule('.cam-zoom')).toContain('flex-wrap:wrap');
 expect(css).toContain('.cam-zoom.off input[type=range]{display:none}');
 expect(css).not.toMatch(/blur\(|gradient|shadow|rgba\(|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{8}\b/);
});
