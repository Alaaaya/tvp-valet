import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {readTheme,writeTheme,THEME_KEY} from './theme';
describe('Azraq theme',()=>{
 it('persists as choice and keeps others',()=>{const out:Record<string,string>={};writeTheme({setItem:(k,v)=>{out[k]=v}},'azraq');expect(out[THEME_KEY]).toBe('azraq');for(const t of ['nana','zaitoun','layl','safa','echt','azraq'] as const)expect(readTheme({getItem:()=>t})).toBe(t);expect(readTheme({getItem:()=>'x'})).toBe('classic')});
 it('is scoped and LTR',()=>{const css=readFileSync('src/azraq-theme.css','utf8');expect(css).not.toMatch(/data-theme=(?:classic|nana|zaitoun|layl|safa|echt)/);expect(css).toContain('direction:ltr');expect(css).toContain('prefers-reduced-motion')});
});
