import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {readTheme,writeTheme,THEME_KEY} from './theme';
import {plateKind} from './plate-country';
describe('Klassisch Echt theme',()=>{
 it('persists as sixth choice and keeps others',()=>{const out:Record<string,string>={};writeTheme({setItem:(k,v)=>{out[k]=v}},'echt');expect(out[THEME_KEY]).toBe('echt');expect(readTheme({getItem:k=>out[k]})).toBe('echt');for(const t of ['nana','zaitoun','layl','safa','echt'])expect(readTheme({getItem:()=>t})).toBe(t);expect(readTheme({getItem:()=>'x'})).toBe('classic')});
 it('css is scoped to echt and uses real plate colors',()=>{const css=readFileSync('src/echt-theme.css','utf8');expect(css).not.toMatch(/data-theme=(?:classic|nana|zaitoun|layl|safa)/);for(const c of ['#003399','#f7c600','#fff'])expect(css).toContain(c)});
 it('plateKind is display only',()=>{expect(plateKind('H461TL')).toBe('NL');expect(plateKind('D-TV 240')).toBe('DE');expect(plateKind('ZZZ 99 QQ 7')).toBe('unknown');expect(plateKind('')).toBeUndefined()});
});
