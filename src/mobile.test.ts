import {describe,expect,it} from 'vitest';
import html from '../index.html?raw';
import {readFileSync} from 'node:fs';const css=readFileSync('src/style.css','utf8');
import main from './main.tsx?raw';
describe('mobile and demo',()=>{
 it('viewport',()=>{expect(html).toContain('maximum-scale=1');expect(html).toContain('viewport-fit=cover')});
 it('inputs 16px on mobile',()=>{expect(css).toMatch(/max-width:650px\)\{\s*input,select,textarea\{font-size:16px!important/);expect(css).toContain('*::before')});
 it('demo gated by DEV',()=>{expect(main).toContain('{import.meta.env.DEV&&<><button className="outline" onClick={demoStart}>');expect(main).toContain('if(!import.meta.env.DEV)return;setDemo(true)')});
});
