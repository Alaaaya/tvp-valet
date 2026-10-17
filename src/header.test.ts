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
 it('plus moved from header to drawer; header keeps one filter button',()=>{
  const header=main.slice(main.indexOf('<header className="topbar">'),main.indexOf('</header><section className="page">'));
  expect(header).toContain('className="header-actions"');
  expect(header).not.toContain('Buchung erstellen');
  expect((header.match(/aria-label="Filter"/g)||[]).length).toBe(1);
  expect(main).toMatch(/className="drawer-action"[^]*?setSelected\(blank\(\)\);setEditing\(true\);setPhotos\(\[\]\)[^]*?Buchung erstellen/);
  expect(css).toContain('.header-actions>button{width:44px;min-height:44px;');
 });
});

describe('no fog anywhere',()=>{
 it('has no blur, gradients, shadows or translucent colors',()=>{
  expect(css).not.toMatch(/blur\(|gradient|shadow|rgba\(|hsla\(/i);
  expect(css).not.toMatch(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{4}\b/);
  expect(css).not.toMatch(/backdrop-filter:(?!none)/);
  expect(html).toContain('status-bar-style" content="default"');
  expect(html).toContain('name="theme-color" content="#0f6b67"');
 });
});
