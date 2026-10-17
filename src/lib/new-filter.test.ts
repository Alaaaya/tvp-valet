import {describe,expect,it} from 'vitest';
import {applyNewFilter,DEFAULT_FILTER,loadFilter,saveFilter,parseFilter,filterKey,serviceOf,locationOptions,activeCount,SERVICE_TYPES} from './new-filter';
const mem=()=>{const m=new Map<string,string>();return{m,getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v)},removeItem:(k:string)=>{m.delete(k)}}};
const b=(id:string,status:string,product='AP-V-C'):any=>({id,status,product});
const rows=[b('a','confirmed'),b('b','cancelled'),b('c','no_show'),b('d','confirmed','FSP-V-F')];
describe('new filter',()=>{
  it('hides cancelled and no-shows by default, shows when on',()=>{expect(applyNewFilter(rows,DEFAULT_FILTER).map(r=>r.id)).toEqual(['a','d']);expect(applyNewFilter(rows,{...DEFAULT_FILTER,cancelled:true,noShow:true}).length).toBe(4)});
  it('location filter is a single product, only when enabled',()=>{expect(applyNewFilter(rows,{...DEFAULT_FILTER,locationOn:true,location:'FSP-V-F'}).map(r=>r.id)).toEqual(['d']);expect(applyNewFilter(rows,{...DEFAULT_FILTER,locationOn:false,location:'FSP-V-F'}).length).toBe(2);expect(applyNewFilter(rows,{...DEFAULT_FILTER,locationOn:true,location:''}).length).toBe(2)});
  it('unavailable service types filter nothing, valet is derived',()=>{expect(applyNewFilter(rows,{...DEFAULT_FILTER,services:['Cruise']}).length).toBe(2);expect(applyNewFilter(rows,{...DEFAULT_FILTER,services:['Valet']}).length).toBe(2);expect(serviceOf({product:'VALET-F'})).toBe('Valet');expect(serviceOf({product:'XY'})).toBeNull()});
  it('exact service labels',()=>{expect([...SERVICE_TYPES]).toEqual(['Shuttle','Valet','Terminal','Cruise','Valet/Shuttle','Shuttle/Valet'])});
  it('persists per user and does not touch auth keys',()=>{const s=mem();s.setItem('sb-auth-token','x');const f={...DEFAULT_FILTER,cancelled:true,services:['Valet'] as any};saveFilter('u1',f,s);expect(loadFilter('u1',s)).toEqual(f);expect(loadFilter('u2',s)).toEqual(DEFAULT_FILTER);expect(s.getItem('sb-auth-token')).toBe('x');expect(filterKey('u1')).toContain('v1')});
  it('no user or broken storage gives defaults',()=>{expect(loadFilter(undefined,mem())).toEqual(DEFAULT_FILTER);expect(parseFilter('{bad')).toEqual(DEFAULT_FILTER);expect(parseFilter('{"v":2,"cancelled":true}')).toEqual(DEFAULT_FILTER);expect(parseFilter(JSON.stringify({v:1,services:['Valet','Bogus'],cancelled:'yes'}))).toMatchObject({services:['Valet'],cancelled:false})});
  it('options and active count',()=>{expect(locationOptions(rows)).toEqual(['AP-V-C','FSP-V-F']);expect(activeCount(DEFAULT_FILTER)).toBe(0);expect(activeCount({...DEFAULT_FILTER,cancelled:true,services:['Valet']})).toBe(2)});
});
