import {readFileSync} from 'node:fs';import {describe,it,expect} from 'vitest';
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
describe('iOS status-bar edge: bookings topbar is pinned so iOS tints instead of fogging',()=>{
 const css=read('./status-edge.css');
 it('real bookings topbar is position:fixed at the top edge with an opaque colour',()=>{
  const rule=css.match(/\.app\.fixed-top>\.workspace>\.topbar\{([^}]*)\}/)?.[1]??'';
  expect(rule).toMatch(/position:fixed;top:0;left:0;right:0/);
  expect(rule).toMatch(/height:var\(--tvp-topbar-h\)!important/);
  expect(rule).toMatch(/background-color:#0d6b6b!important/);
  expect(rule).toMatch(/opacity:1/);
  expect(css).not.toMatch(/blur\(|gradient|shadow|rgba\(/i);
 });
 it('workspace reserves exactly the topbar height (same formula as list-size)',()=>{
  expect(css).toMatch(/--tvp-topbar-h:calc\(max\(44px,44px \* var\(--list-scale,1\)\) \+ env\(safe-area-inset-top\)\);\s*padding-top:var\(--tvp-topbar-h\)/);
  expect(read('./list-size.css')).toContain('.app.fixed-top .topbar{height:calc(max(44px,44px * var(--list-scale)) + env(safe-area-inset-top))!important}');
 });
 it('settings preview topbar is not pinned (selector needs the .workspace child)',()=>{
  expect(css).not.toMatch(/\.app\.fixed-top \.topbar\{[^}]*position:fixed/);
  expect(read('./main.tsx')).toMatch(/<div className="app fixed-top list-size-preview"[^>]*><header className="topbar">/);
 });
 it('loaded after the reference styles and status bar stays non-translucent',()=>{
  const main=read('./main.tsx');
  expect(main.indexOf("import './status-edge.css'")).toBeGreaterThan(main.indexOf("import './reference-polish.css'"));
  expect(read('../index.html')).toContain('status-bar-style" content="default"');
 });
});
