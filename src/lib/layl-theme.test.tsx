import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {readTheme,writeTheme,THEME_KEY} from './theme';
describe('Layl night theme',()=>{
 it('persists as fourth choice and keeps others',()=>{const out:Record<string,string>={};writeTheme({setItem:(k,v)=>{out[k]=v}},'layl');expect(out[THEME_KEY]).toBe('layl');expect(readTheme({getItem:k=>out[k]})).toBe('layl');for(const t of ['nana','zaitoun'])expect(readTheme({getItem:()=>t})).toBe(t);expect(readTheme({getItem:()=>'x'})).toBe('classic')});
 it('is scoped and uses specified palette',()=>{const css=readFileSync('src/layl-theme.css','utf8');expect(css).not.toMatch(/data-theme=(?:classic|nana|zaitoun)/);for(const c of ['#0b1220','#121a2b','#f5c451'])expect(css).toContain(c);expect(css).toContain('prefers-reduced-motion')});
});
