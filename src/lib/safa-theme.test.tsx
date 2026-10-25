import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {readTheme,writeTheme,THEME_KEY} from './theme';
describe('Safa white theme',()=>{
 it('persists as fifth choice and keeps others',()=>{const out:Record<string,string>={};writeTheme({setItem:(k,v)=>{out[k]=v}},'safa');expect(out[THEME_KEY]).toBe('safa');expect(readTheme({getItem:k=>out[k]})).toBe('safa');for(const t of ['nana','zaitoun','layl','safa'])expect(readTheme({getItem:()=>t})).toBe(t);expect(readTheme({getItem:()=>'x'})).toBe('classic')});
 it('is scoped and uses specified palette',()=>{const css=readFileSync('src/safa-theme.css','utf8');expect(css).not.toMatch(/data-theme=(?:classic|nana|zaitoun|layl)/);for(const c of ['#eef0f3','#16a34a','#dc2626','#0b2a5b'])expect(css).toContain(c);expect(css).toContain('prefers-reduced-motion')});
});
