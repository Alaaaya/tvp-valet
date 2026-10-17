import {readFileSync} from 'node:fs';import {describe,it,expect} from 'vitest';
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
describe('no fog in both stylesheets',()=>{
 for(const f of['./style.css','./handover.css'])it(f,()=>{const css=read(f);
  expect(css).not.toMatch(/blur\(|gradient|shadow|rgba\(|hsla\(/i);
  expect(css).not.toMatch(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{4}\b/);
  expect(css).not.toMatch(/backdrop-filter:(?!none)/);});
 it('status bar default',()=>expect(read('../index.html')).toContain('status-bar-style" content="default"'));
 it('signature canvas solid white',()=>expect(read('./handover.css')).toMatch(/\.sig-canvas\{[^}]*background:#fff[;}]/));
});
