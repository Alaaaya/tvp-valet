import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import main from './main.tsx?raw';
const css=readFileSync('src/brand-theme.css','utf8');
describe('TVP brand theme',()=>{
 it('is imported after every other stylesheet',()=>{
  const imports=[...main.matchAll(/import\s+'\.\/([\w-]+\.css)'/g)].map(m=>m[1]);
  expect(imports[imports.length-1]).toBe('brand-theme.css');
 });
 it('defines the navy/gold/silver palette and inbound/outbound semantics as variables',()=>{
  for(const v of ['--tvp-navy:#14213D','--tvp-gold:#C9A24A','--tvp-gold-hi:#E6C77A','--tvp-gold-dk:#A8822E','--tvp-silver:#F4F5F7','--tvp-in:#1F8A5B','--tvp-out:#C0392B'])expect(css).toContain(v);
 });
 it('uses no remote font CDN',()=>{
  expect(css).not.toMatch(/fonts\.googleapis|@import\s+url\(\s*['"]?https?:/);
  expect(readFileSync('src/style.css','utf8')).not.toContain('fonts.googleapis');
 });
 it('shows the logo on the login screen and the monogram badge in the drawer',()=>{
  expect(main).toContain('className="brand-logo" src={brandLogo}');
  expect(main).toMatch(/className="drawer-logo"><img src=\{brandBadge\}/);
 });
});
