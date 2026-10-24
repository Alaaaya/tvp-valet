// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';
import {describe,expect,it,vi} from 'vitest';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
vi.mock('./handover-api',()=>({listBookingMedia:vi.fn(),signedMediaUrl:vi.fn(),mediaBlob:vi.fn()}));
import {Viewer} from './gallery';
const css=readFileSync(resolve(process.cwd(),'src/handover.css'),'utf8');
const rule=(sel:string)=>{const i=css.indexOf(sel+'{');expect(i,sel).toBeGreaterThan(-1);return css.slice(i,css.indexOf('}',i))};
const items=[0,1,2].map(i=>({id:'m'+i,path:'p',kind:'photo' as const,mime_type:'image/jpeg',captured_at:'2026-10-09T15:37:00Z',size_bytes:1}));
const ok=()=>Promise.resolve();
function mount(map:Record<string,{url:string;at:number}>,index=0){const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
 act(()=>{root.render(<Viewer items={items} index={index} setIndex={()=>{}} onClose={()=>{}} map={map} errs={{}} ensure={ok} bad={()=>{}} good={()=>{}} retry={ok}/>)});return {host,root}}
describe('media viewer reference layout',()=>{
 it('photo sits in a bordered rounded card, full width, 3:4, cover',()=>{
  expect(rule('.gv-card')).toMatch(/border-radius:24px/);expect(rule('.gv-card')).toMatch(/border:1px solid #[0-9a-f]{6}/);expect(rule('.gv-card')).toMatch(/padding:20px 0/);
  const st=rule('.gv-stage');expect(st).toContain('width:100%');expect(st).toContain('aspect-ratio:3/4');expect(st).toContain('max-height:57dvh');
  expect(css).toContain('.gv-stage.is-photo .gv-frame img{object-fit:cover}');
  expect(css).toMatch(/\.gv\.full \.gv-stage \.gv-frame img\{object-fit:contain\}/);
 });
 it('white section title, 4 portrait thumbs with blue selection',()=>{
  expect(rule('html body .gv h3.gv-title.gv-title')).toContain('color:#fff');
  const b=rule('.gv-strip button');expect(b).toContain('flex:0 0 calc((100% - 36px)/4)');expect(b).toContain('aspect-ratio:3/4');expect(b).toContain('border-radius:14px');
  expect(rule('.gv-strip button.on')).toContain('border:3px solid #5ab0f0');expect(css).toMatch(/\.gv-strip img\{[^}]*object-fit:cover/);
  expect(rule('.gv-pills span')).toMatch(/border:1px solid/);expect(rule('.gv-acts .gv-round')).toMatch(/border:1\.5px solid/);
 });
 it('renders card, overlays and keeps the box while loading',async()=>{
  const {host,root}=mount({m0:{url:'blob:a',at:Date.now()}});
  const card=host.querySelector('.gv-card')!;expect(card.querySelector('.gv-stage.is-photo .gv-frame img')).not.toBeNull();
  for(const s of['.gv-count','.gv-fs','.gv-nav.l','.gv-nav.r'])expect(card.querySelector('.gv-stage '+s),s).not.toBeNull();
  expect(host.querySelector('.gv-count')!.textContent).toBe('1 /3');
  expect(host.querySelector('.gv-strip button.on b')!.textContent).toBe('1');
  await act(async()=>{root.unmount()});host.remove();
  const l=mount({},1);expect(l.host.querySelector('.gv-card .gv-stage .gv-load')).not.toBeNull();await act(async()=>{l.root.unmount()});l.host.remove();
 });
});
