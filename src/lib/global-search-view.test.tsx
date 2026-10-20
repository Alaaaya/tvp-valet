import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {GlobalSearchView,coverageText} from './global-search-view';
import {loadAllBookingsOnline} from './global-search-online';
import {searchLocal} from './global-search';
const row=(i:number)=>({id:'id'+String(i).padStart(4,'0'),plate:'DH-XF'+i,phone:null,email:null,code:'C'+i,customer_name:'X',arrival_at:'2026-10-01T00:00:00Z',departure_at:'2026-10-02T00:00:00Z',status:'confirmed'});
function client(total:number,calls:any[]){const all=Array.from({length:total},(_,i)=>row(i));return{from:(table:string)=>{const q:any={table,ord:[] as string[]};q.select=()=>q;q.order=(c:string)=>{q.ord.push(c);return q};q.range=(a:number,b:number)=>{q.a=a;q.b=b;return q};q.abortSignal=(s:AbortSignal)=>{calls.push(q);return Promise.resolve({data:all.slice(q.a,q.b+1),error:null})};return q}}}
describe('global search view',()=>{
 it('pages all rows ordered by arrival_at,id and normalizes nulls',async()=>{const calls:any[]=[];const rows=await loadAllBookingsOnline(new AbortController().signal,client(1203,calls));expect(rows).toHaveLength(1203);expect(calls).toHaveLength(3);expect(calls[0].ord).toEqual(['arrival_at','id']);expect(rows[0].phone).toBe('');expect(rows[0].email).toBe('')});
 it('dedupes rows repeated across pages',async()=>{const c:any={from:()=>{const q:any={};q.select=()=>q;q.order=()=>q;q.range=(a:number)=>{q.a=a;return q};q.abortSignal=()=>Promise.resolve({data:q.a===0?[row(1),row(2)]:[],error:null});return q}};const rows=await loadAllBookingsOnline(new AbortController().signal,c);expect(rows).toHaveLength(2)});
 it('surfaces query errors, never an empty success',async()=>{const c:any={from:()=>{const q:any={};q.select=()=>q;q.order=()=>q;q.range=()=>q;q.abortSignal=()=>Promise.resolve({data:null,error:new Error('rls denied')});return q}};await expect(loadAllBookingsOnline(new AbortController().signal,c)).rejects.toThrow('rls denied')});
 it('aborted load rejects',async()=>{const ctl=new AbortController();ctl.abort();await expect(loadAllBookingsOnline(ctl.signal,client(10,[]))).rejects.toThrow()});
 it('coverage text distinguishes partial cache',()=>{expect(coverageText(undefined)).toBe('');expect(coverageText({from:Date.parse('2026-10-06'),to:Date.parse('2026-11-03'),at:null,partial:true})).toMatch(/gespeicherter Zeitraum|Saved period/i);expect(coverageText({from:null,to:null,at:null,partial:false})).toMatch(/alle verfügbaren|all available/i)});
 it('initial render shows searching, not a fake empty result',()=>{const h=r(<GlobalSearchView query="dh" scopeKey="a" load={async()=>({rows:[],source:'online'})} onOpen={()=>{}}/>);expect(h).toMatch(/Suche in allen Tagen|Searching all days/);expect(h).not.toMatch(/Keine Buchung gefunden|No booking found/)});
 it('cached older bookings are all searched with same matcher and date order',()=>{const now=Date.parse('2026-10-20T00:00:00Z');const rows=['2026-09-01','2026-10-25','2026-10-30','2026-10-10'].map((d,i)=>({...row(i),plate:'AB-1',arrival_at:d+'T08:00:00Z',phone:'0172 123456'}));expect(searchLocal(rows as any,'ab1',now).map(x=>x.arrival_at.slice(0,10))).toEqual(['2026-10-25','2026-10-30','2026-10-10','2026-09-01']);expect(searchLocal(rows as any,'+49172123',now)).toHaveLength(4)});
 it('rows are lists not grids, rtl-safe, solid',()=>{const c=readFileSync('src/lib/global-search-view.css','utf8');expect(c).not.toMatch(/gradient|backdrop-filter|blur/);expect(c).toMatch(/flex-direction:column/);const v=readFileSync('src/lib/global-search-view.tsx','utf8');expect(v).toContain('dir="ltr"');expect(v).toContain('aria-live')});
 it('main hides but keeps day list; empty query shows day list unchanged',()=>{const m=readFileSync('src/main.tsx','utf8');expect(m).toContain('query.trim()&&<GlobalSearchView');expect(m).toContain('hidden={!!query.trim()}');expect(m).toContain("scopeKey={authUid+")});
});
