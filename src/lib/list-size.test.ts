import{expect,it}from'vitest';
import{readListSize,writeListSize,normalizeListSize,LIST_SIZE_KEY,LIST_SIZES}from'./list-size';
it('defaults to medium100 and validates corrupt persisted settings',()=>{
 for(const raw of [null,'broken','null','"150"','{}','[]','0','200','99','1e400'])expect(readListSize({getItem:()=>raw})).toBe(100);
 for(const n of [85,100,120,135,150])expect(readListSize({getItem:()=>JSON.stringify(n)})).toBe(n);
 expect(readListSize({getItem:()=>{throw Error()}})).toBe(100);
 expect(normalizeListSize(NaN)).toBe(100);expect(LIST_SIZES.map(s=>s.percent)).toEqual([85,100,120,135,150]);
});
it('persists valid choices and survives storage errors',()=>{
 let value='';writeListSize({setItem:(key,v)=>{expect(key).toBe(LIST_SIZE_KEY);value=v}},135);
 expect(readListSize({getItem:()=>value})).toBe(135);
 expect(()=>writeListSize({setItem:()=>{throw Error()}},150)).not.toThrow();
});

import { readFileSync } from 'node:fs';
it('counter visual height is 41 with a 44px+ hit area and no min-height override', () => {
  const c = readFileSync('src/reference-list.css', 'utf8');
  expect(c).toContain('.counter{height:41px;min-height:41px;position:relative}');
  expect(c).toContain('.counter::after{content:"";position:absolute;inset:-2px 0}');
});
it('flight stays fully visible in time pane and placeholder is short', () => {
  const c = readFileSync('src/reference-list.css', 'utf8');
  expect(c).toContain('.blr-tf>span{overflow:visible;text-overflow:clip;white-space:nowrap');
  expect(readFileSync('src/main.tsx', 'utf8')).toContain('placeholder="Kennzeichen oder Name"');
});
