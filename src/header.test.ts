import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import main from './main.tsx?raw';
import html from '../index.html?raw';
import manifestRaw from '../public/manifest.webmanifest?raw';
const css=readFileSync('src/style.css','utf8');
describe('solid standalone header',()=>{
 it('matches browser and installed theme colors',()=>{
  expect(html).toContain('name="theme-color" content="#0f6b67"');
  expect(JSON.parse(manifestRaw).theme_color).toBe('#0f6b67');
  expect(css).toContain('html:root{background:#0f6b67}');
 });
 it('paints the safe area with opaque chrome without blur',()=>{
  expect(css).toContain('.topbar,.detail>header,.filter-screen>header{');
  expect(css).toContain('background:#0f6b67!important;background-image:none!important;');
  expect(css).toContain('opacity:1;backdrop-filter:none;-webkit-backdrop-filter:none;');
  expect(css).toContain('height:calc(56px + env(safe-area-inset-top))!important;padding-top:env(safe-area-inset-top)');
 });
 it('puts a named plus button inside the header, not a light strip',()=>{
  const header=main.slice(main.indexOf('<header className="topbar">'),main.indexOf('</header><section className="page">'));
  expect(header).toContain('className="header-actions"');
  expect(header).toContain('aria-label="Buchung erstellen"');
  expect(header).toContain('setSelected(blank());setEditing(true);setPhotos([])');
  expect(header).toContain('<Plus size={24}/>');
  expect(main).not.toContain('<Plus size={18}/> Buchung');
  expect(css).toContain('.header-actions>button{width:44px;min-height:44px;');
 });
});
