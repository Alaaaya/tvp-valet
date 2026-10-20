import {describe,it,expect,vi} from 'vitest';
import {normalizePlate,searchLocal,fetchAllPages,createGlobalSearch} from './global-search';
const b=(id:string,plate:string,arrival:string,name='X')=>({id,plate,code:'C'+id,customer_name:name,arrival_at:arrival,departure_at:arrival,status:'confirmed' as const});
describe('global search',()=>{
 it('normalizes plates',()=>{expect(normalizePlate('DH-XF 333')).toBe('dhxf333')});
 it('finds dhxf333 and keeps original plate',()=>{const r=searchLocal([b('1','DH-XF333','2026-10-01T00:00:00Z')],'dhxf333');expect(r[0].plate).toBe('DH-XF333')});
 it('orders upcoming asc then past desc',()=>{const now=Date.parse('2026-10-20T00:00:00Z');
  const r=searchLocal([b('a','AB1','2026-10-10T00:00:00Z'),b('b','AB1','2026-10-25T00:00:00Z'),b('c','AB1','2026-10-22T00:00:00Z'),b('d','AB1','2026-10-15T00:00:00Z')],'ab1',now);
  expect(r.map(x=>x.id)).toEqual(['c','b','d','a'])});
 it('matches name and code',()=>{expect(searchLocal([b('1','','2026-10-01T00:00:00Z','Fabio Rossi')],'fabio')).toHaveLength(1);expect(searchLocal([b('1','','2026-10-01T00:00:00Z')],'c1')).toHaveLength(1)});
 it('paginates all pages',async()=>{const f=vi.fn(async(from:number,to:number)=>Array.from({length:Math.max(0,Math.min(to+1,1100)-from)},(_,i)=>from+i));
  const r=await fetchAllPages(f,new AbortController().signal,500);expect(r).toHaveLength(1100);expect(f).toHaveBeenCalledTimes(3)});
 it('abort stops pagination',async()=>{const c=new AbortController();await expect(fetchAllPages(async()=>{c.abort();return [1]},c.signal,1)).rejects.toThrow()});
 it('debounce delivers only latest',async()=>{vi.useFakeTimers();const out:any[]=[];
  const s=createGlobalSearch({load:async()=>[b('1','AB-1','2026-10-01T00:00:00Z')],onResult:r=>out.push(r),delay:100});
  s.set('a');s.set('ab1');await vi.advanceTimersByTimeAsync(200);
  expect(out.filter(Boolean)).toHaveLength(1);expect(out.at(-1).query).toBe('ab1');s.set('');expect(out.at(-1)).toBeNull();vi.useRealTimers()});
});
