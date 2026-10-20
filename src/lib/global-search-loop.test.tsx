// @vitest-environment jsdom
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {GlobalSearchView} from './global-search-view';
import {readFileSync} from 'node:fs';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
it('cache metadata emitted by a load cannot restart a search; query clear drops old results',async()=>{
 vi.useFakeTimers();
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 let setQuery!:(s:string)=>void;
 const load=vi.fn(async()=>{update(n=>n+1);return {rows:[],source:'online' as const}});
 let update!:(f:(n:number)=>number)=>void;
 function Harness(){const[q,sq]=useState('AB');setQuery=sq;const[cacheAt,sc]=useState(0);update=sc;return <div data-cache={cacheAt}><GlobalSearchView query={q} scopeKey={'u:0:true'} load={load} onOpen={()=>{}}/></div>}
 try{
 await act(async()=>root.render(<Harness/>));
 await act(async()=>{await vi.advanceTimersByTimeAsync(2000)});
 expect(load).toHaveBeenCalledTimes(1);
 await act(async()=>{await vi.advanceTimersByTimeAsync(10000)});
 expect(load).toHaveBeenCalledTimes(1);
 await act(async()=>setQuery(''));
 expect(host.textContent).not.toContain('Keine Buchung gefunden');
 await act(async()=>setQuery('CD'));
 await act(async()=>{await vi.advanceTimersByTimeAsync(2000)});
 expect(load).toHaveBeenCalledTimes(1);
 }finally{await act(async()=>root.unmount());host.remove();vi.useRealTimers()}
});
it('main search scope excludes cacheAt/error and reuses complete scoped snapshots',()=>{
 const s=readFileSync('src/main.tsx','utf8');
 const key=s.slice(s.indexOf('scopeKey={authUid+'),s.indexOf(' load={globalLoad}'));
 expect(key).not.toContain('cacheAt');expect(key).not.toContain('offline.error');
 expect(s).toContain('before.accountId===authUid&&(before.complete||!before.online)');
 expect(s).toContain('cachedOfflineBooking(o.id)?.offline_pending');
 expect(s).toContain('if(!s||editing)return s;const r=rows.find(x=>x.id===s.id)');
});
