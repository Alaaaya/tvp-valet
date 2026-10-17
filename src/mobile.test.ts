import {describe,expect,it} from 'vitest';
import html from '../index.html?raw';
import {readFileSync} from 'node:fs';const css=readFileSync('src/style.css','utf8');
import main from './main.tsx?raw';
describe('mobile and demo',()=>{
 it('viewport',()=>{expect(html).toContain('maximum-scale=1');expect(html).toContain('viewport-fit=cover')});
 it('inputs 16px on mobile',()=>{expect(css).toMatch(/max-width:650px\)\{\s*input,select,textarea,/);expect(css).not.toMatch(/\[class\*=/);expect(css).toContain('.identity-grid,.split-handover,.ops-grid{grid-template-columns:repeat(2,minmax(0,1fr))}');expect(css).toContain('.form-grid,.admin-grid{grid-template-columns:minmax(0,1fr)}');expect(css).not.toContain('\n.admin-grid{grid-template-columns:minmax(0,1fr)}');expect(css).toContain('.filter-chips{flex-wrap:wrap}');expect(css).toContain('.date-strip input{width:158px}');expect(css).toContain('.filter-group input[type=date]{width:150px}');expect(css).toContain('calc(56px + env(safe-area-inset-top))!important');expect(css).toContain('.sidebar{padding-top:calc(26px + env(safe-area-inset-top))!important;padding-bottom:calc(26px + env(safe-area-inset-bottom))!important}');expect(css).toContain('.cash-row,.staff-row{flex-wrap:wrap');expect(css).toContain('*::before')});
 it('demo gated by DEV',()=>{expect(main).toContain('{import.meta.env.DEV&&<><button className="outline" onClick={demoStart}>');expect(main).toContain('if(!import.meta.env.DEV)return;setDemo(true)')});
});
