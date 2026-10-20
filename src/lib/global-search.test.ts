import {describe,it,expect,vi} from 'vitest';
import {matchesBooking,matchesPhone,foldName,normalizePlate,searchLocal,fetchAllPages,createGlobalSearch} from './global-search';
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

describe('phone/name/code',()=>{
 const ph=(p:string)=>({...b('1','','2026-10-01T00:00:00Z'),phone:p});
 it('german variants equal',()=>{for(const stored of ['+49 172 123456','0049172123456','0172/123456'])for(const q of ['+49 172123','0049172123','0172123','172123','+49-172-123'])expect(matchesPhone(stored,q),stored+' '+q).toBe(true)});
 it('does not strip 49 from other countries',()=>{expect(matchesPhone('+44 4912345','+49 12345')).toBe(false);expect(matchesPhone('+43 172123456','0172123')).toBe(false);expect(matchesPhone('+44 7911 123456','+44 7911')).toBe(true)});
 it('short or non-phone queries ignored',()=>{expect(matchesPhone('0172123','01')).toBe(false);expect(matchesPhone('0172123','abc')).toBe(false)});
 it('names fold umlauts',()=>{for(const q of ['muller','mueller','müller','MÜLLER','Muel'])expect(matchesBooking({...b('1','','2026-10-01T00:00:00Z','Hans Müller')},q),q).toBe(true);expect(foldName('Strauß')).toBe(foldName('Strauss'));expect(matchesBooking({...b('1','','2026-10-01T00:00:00Z','José Äpfel')},'jose apfel')).toBe(true)});
 it('partial case-insensitive code and external_id',()=>{const x={...b('1','','2026-10-01T00:00:00Z'),code:'TVP-AB12',external_id:'AF-EMWJZZG'};expect(matchesBooking(x,'tvp-ab')).toBe(true);expect(matchesBooking(x,'emwj')).toBe(true);expect(matchesBooking(x,'zzzzq')).toBe(false)});
 it('same matcher via searchLocal incl phone',()=>{expect(searchLocal([ph('+49 172 123456')],'0172123')).toHaveLength(1)});
 it('account reset drops cache and stale result',async()=>{vi.useFakeTimers();let who='A';const out:any[]=[];const s=createGlobalSearch({load:async()=>[b(who,'AB-1','2026-10-01T00:00:00Z')],onResult:r=>out.push(r),delay:10});
  s.set('ab1');await vi.advanceTimersByTimeAsync(20);who='B';s.reset();s.set('ab1');await vi.advanceTimersByTimeAsync(20);expect(out.at(-1).rows[0].id).toBe('B');vi.useRealTimers()});
 it('reset during load discards result',async()=>{vi.useFakeTimers();const out:any[]=[];let rel:()=>void=()=>{};const s=createGlobalSearch({load:()=>new Promise<any[]>(r=>{rel=()=>r([b('1','AB-1','2026-10-01T00:00:00Z')])}),onResult:r=>out.push(r),delay:10});
  s.set('ab1');await vi.advanceTimersByTimeAsync(20);s.reset();rel();await vi.advanceTimersByTimeAsync(5);expect(out.filter(Boolean)).toHaveLength(0);vi.useRealTimers()});
});
