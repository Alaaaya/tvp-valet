import {describe,it,expect} from 'vitest';
import {runUploads,type UpItem} from './multi-upload';
import type {PendingMedia} from './handover-api';
const mk=(n:number):PendingMedia[]=>Array.from({length:n},(_,i)=>({id:'id'+i,blob:new Blob(['x'],{type:'image/jpeg'}),kind:'photo',mime_type:'image/jpeg',captured_at:new Date().toISOString(),name:'p'+i+'.jpg'}));
describe('runUploads',()=>{
 it('uploads all sequentially with progress',async()=>{const items=mk(3),st=new Map<string,UpItem>(),sent:string[]=[],snaps:number[]=[];
  await runUploads(items,st,async m=>{sent.push(m.id)},s=>snaps.push([...s.values()].filter(x=>x.status==='done').length),()=>true);
  expect(sent).toEqual(['id0','id1','id2']);expect([...st.values()].every(x=>x.status==='done')).toBe(true);expect(snaps).toContain(3)});
 it('partial failure then retry never duplicates done items',async()=>{const items=mk(3),st=new Map<string,UpItem>(),sent:string[]=[];let fail=true;
  const send=async(m:PendingMedia)=>{if(m.id==='id1'&&fail)throw Error('net');sent.push(m.id)};
  await runUploads(items,st,send,()=>{},()=>true);
  expect(st.get('id1')?.status).toBe('failed');expect(st.get('id1')?.error).toBe('net');expect(sent).toEqual(['id0','id2']);
  fail=false;await runUploads(items,st,send,()=>{},()=>true);
  expect(sent).toEqual(['id0','id2','id1']);expect([...st.values()].every(x=>x.status==='done')).toBe(true)});
 it('stops and stays silent after cancel/account switch',async()=>{const items=mk(3),st=new Map<string,UpItem>(),sent:string[]=[];let alive=true,changes=0;
  await runUploads(items,st,async m=>{sent.push(m.id);alive=false},()=>{changes++},()=>alive);
  expect(sent).toEqual(['id0']);expect(changes).toBe(1)});
});
