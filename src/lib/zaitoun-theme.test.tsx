import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {BookingListRow} from './booking-list-row';
import {blank} from '../model';
import {readTheme,writeTheme,THEME_KEY} from './theme';
describe('Zaitoun presentation only',()=>{
 it.each([{checked_in_at:null,plate:'D-TV 24',expected:false},{checked_in_at:'2026-10-25T08:00:00Z',plate:'D-TV 24',expected:true},{checked_in_at:'2026-10-25T08:00:00Z',plate:' aa-test-bb ',expected:false}])('plate follows actual check-in, not row completion $expected',({expected,...state})=>{
 const b=Object.freeze({...blank(),...state,customer_name:'QA',total:60,paid:20,comment:'Destination = Düsseldorf Airport'});const before=JSON.stringify(b);
 for(const completed of [true,false]){const h=renderToStaticMarkup(<BookingListRow b={b} kind="out" time="12:00" completed={completed} onOpen={()=>{}}/>);expect(h).toContain('data-checked-in="'+expected+'"');expect(h).toContain('zaitoun-note-pin');expect(h).toContain('40,00');}expect(JSON.stringify(b)).toBe(before);
 });
 it('persists the third choice without replacing the key',()=>{const out:Record<string,string>={};writeTheme({setItem:(k,v)=>{out[k]=v}},'zaitoun');expect(out[THEME_KEY]).toBe('zaitoun');expect(readTheme({getItem:k=>out[k]})).toBe('zaitoun')});
 it('scopes glossy colors to the third theme',()=>{const css=readFileSync('src/zaitoun-theme.css','utf8');expect(css).not.toMatch(/data-theme=(?:classic|nana)/);expect(css).toContain('--zaitoun-gloss-green');expect(css).toContain('[data-checked-in=true] .blr-plate');expect(css).toContain('.zaitoun-note-pin{display:none}');expect(css).toContain('.blr-pay{background:#009a3e!important;color:#fff!important')});
});
