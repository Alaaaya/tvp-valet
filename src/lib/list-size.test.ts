import{expect,it}from'vitest';
import{readListSize,writeListSize,normalizeListSize,LIST_SIZE_KEY}from'./list-size';
it('defaults to medium120 and validates corrupt persisted settings',()=>{
 for(const raw of [null,'broken','null','"150"','{}','[]','0','200','100','1e400'])expect(readListSize({getItem:()=>raw})).toBe(120);
 for(const n of [85,120,135,150])expect(readListSize({getItem:()=>JSON.stringify(n)})).toBe(n);
 expect(readListSize({getItem:()=>{throw Error()}})).toBe(120);
 expect(normalizeListSize(NaN)).toBe(120);
});
it('persists valid choices and survives storage errors',()=>{
 let value='';writeListSize({setItem:(key,v)=>{expect(key).toBe(LIST_SIZE_KEY);value=v}},135);
 expect(readListSize({getItem:()=>value})).toBe(135);
 expect(()=>writeListSize({setItem:()=>{throw Error()}},150)).not.toThrow();
});
