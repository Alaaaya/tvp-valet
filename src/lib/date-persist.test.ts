import {expect,it} from 'vitest';
import {readDate,writeDate,validDay,dateKey} from './date-persist';
const mem=()=>{const m=new Map<string,string>();return{m,getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v)}}};
it('main and new dates are independent and per user',()=>{const s=mem();writeDate(s,'main','u1','2026-10-01');writeDate(s,'new','u1','2026-10-05');expect(readDate(s,'main','u1','x')).toBe('2026-10-01');expect(readDate(s,'new','u1','x')).toBe('2026-10-05');expect(readDate(s,'main','u2','fb')).toBe('fb')});
it('rejects invalid dates and broken storage',()=>{const s=mem();writeDate(s,'main','u1','2026-02-31');expect(s.m.size).toBe(0);s.m.set(dateKey('main','u1'),'garbage');expect(readDate(s,'main','u1','fb')).toBe('fb');expect(validDay('2026-13-01')).toBe(false);expect(readDate({getItem(){throw new Error('x')}},'main','u1','fb')).toBe('fb');expect(readDate(null,'main','u1','fb')).toBe('fb');expect(readDate(s,'main','','fb')).toBe('fb')});
