// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,expect,it,vi} from 'vitest';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
vi.mock('./handover-api',()=>({
 listBookingMedia:vi.fn(async(id:string)=>id==='A'?[{id:'m1',kind:'photo',captured_at:'2026-10-01T10:00:00Z',mime_type:'image/jpeg'}]:new Promise(()=>{})),
 signedMediaUrl:vi.fn(async(m:any)=>'https://x/'+m.id+'.jpg'),mediaBlob:vi.fn()}));
import {MediaGallery} from './gallery';
const P=(id:string,demo=false)=><MediaGallery bookingId={id} demo={demo} refreshKey={0} local={[]}/>;
describe('MediaGallery booking switch',()=>{
 it('drops old tiles and viewer immediately when bookingId changes',async()=>{
  const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
  await act(async()=>{root.render(P('A'))});await act(async()=>{});
  expect(host.querySelectorAll('.mg-tile')).toHaveLength(1);
  await act(async()=>{(host.querySelector('.mg-tile') as HTMLElement).click()});
  expect(host.querySelector('.gv')).not.toBeNull();
  await act(async()=>{root.render(P('B'))});
  expect(host.querySelectorAll('.mg-tile')).toHaveLength(0);expect(host.querySelector('.gv')).toBeNull();expect(host.querySelector('img')).toBeNull();
 });
 it('demo mode also remounts',async()=>{const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
  await act(async()=>{root.render(<MediaGallery bookingId="A" demo refreshKey={0} local={[{name:'a',url:'u'}]}/>)});
  await act(async()=>{root.render(<MediaGallery bookingId="B" demo refreshKey={0} local={[]}/>)});expect(host.querySelectorAll('img')).toHaveLength(0)});
});
