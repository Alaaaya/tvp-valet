import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {readTheme,writeTheme,THEME_KEY,ThemeSetting} from './theme';
import {ClaudeRow,ClaudeTitle} from './claude-theme';
import type {Booking} from '../model';
const booking={id:'synthetic',plate:'D-TVP 240',customer_name:'Synthetic Example',code:'SAMPLE',external_id:'DEMO',flight_in:'EW9570',total:65,paid:65,persons:2,covered:true,product:'AP-V-C',platform:'Allopark',comment:'VW Passat',key_cash:''} as Booking;
describe('Claude tenth opt-in reference theme',()=>{
 it('preserves all nine choices and classic fallback',()=>{
 const html=renderToStaticMarkup(<ThemeSetting value="claude" onChange={()=>{}}/>);
 for(const t of ['classic','nana','zaitoun','layl','safa','echt','azraq','samawi','masar','claude']){expect(html).toContain('value="'+t+'"');expect(readTheme({getItem:()=>t})).toBe(t)}
 expect(readTheme({getItem:()=>null})).toBe('classic');expect(readTheme({getItem:()=> 'unknown'})).toBe('classic');
 const data:Record<string,string>={};writeTheme({setItem:(k,v)=>{data[k]=v}},'claude');expect(data[THEME_KEY]).toBe('claude');
 });
 it('isolates styling and honors LTR/reduced motion',()=>{
 const css=readFileSync('src/claude-theme.css','utf8');expect(css).toContain('direction:ltr');expect(css).toContain('prefers-reduced-motion');expect(css).not.toMatch(/data-theme=(classic|nana|masar|samawi)/);
 });
 it('uses stored amounts and does not invent payment processors',()=>{
 const html=renderToStaticMarkup(<ClaudeRow b={booking} kind="in" time="12:30" completed={false} onOpen={()=>{}}/>);
 for(const t of ['D-TVP 240','Synthetic Example','EW9570','12:30','SAMPLE','DEMO','VW Passat','cl-pay'])expect(html).toContain(t);
 expect(html).not.toContain('SYSTEM');expect(html).not.toContain('CREDITCARD');
 });
 it('uses filled provider badges, real DUS label, bordered coverage and semantic icons',()=>{
 const html=renderToStaticMarkup(<ClaudeRow b={booking} kind="in" time="12:30" completed={false} commentCount={1} onOpen={()=>{}}/>);
 for(const t of ['AP-V-C','@ DUS','Über','cl-chat','cl-people','cl-note'])expect(html).toContain(t);
 });
 it('keeps synthetic processor labels explicit and story-only',()=>{
 const html=renderToStaticMarkup(<ClaudeRow b={booking} kind="out" time="07:10" completed={false} onOpen={()=>{}} referencePresentation={{paymentLabel:'SYSTEM · €0.00',referenceLabel:'#4BAQK AL-251511855'}}/>);
 expect(html).toContain('SYSTEM · €0.00');expect(html).toContain('#4BAQK AL-251511855');
 const main=readFileSync('src/main.tsx','utf8');expect(main).not.toContain('referencePresentation');
 });
 it('uses iOS-native-first stacks without forcing downloaded fonts',()=>{
 const css=readFileSync('src/claude-theme.css','utf8');
 expect(css).toContain('--cl-sans:-apple-system,BlinkMacSystemFont,system-ui');
 expect(css).toContain('--cl-mono:ui-monospace,SFMono-Regular,Menlo');
 expect(css).not.toContain('@font-face');expect(css).not.toContain('Claude inter');
 expect(css).toContain('.cl-note.cl-note-ar{font-family:var(--cl-sans)}');
 });
 it('v2 retains all eight corrections as scoped non-regressing UI',()=>{
 const css=readFileSync('src/claude-theme.css','utf8');
 for(const token of ['800 26px/34px','calc(20.5px *','font-weight:700;color:#111827','border-radius:20px','margin-bottom:13.333px','grid-template-columns:minmax(0,1fr) max-content','text-align:right','text-transform:uppercase','background:#d9f2e5','background:#fce2db'])expect(css).toContain(token);
 const html=renderToStaticMarkup(<ClaudeRow b={booking} kind="in" time="12:30" completed={false} commentCount={1} onOpen={()=>{}}/>);
 expect(html).toContain('cl-plane');expect(html).toContain('cl-chat');expect(html).toContain('cl-people');
 const covered=renderToStaticMarkup(<ClaudeRow b={{...booking,flight_in:''}} kind="in" time="07:15" completed={false} onOpen={()=>{}}/>);
 expect(covered).toContain('cl-covered');expect(covered).toContain('COVERED');
 });
 it('v3 uses a filled rectangular chat, outlined people and a dedicated note line before payment',()=>{
 const html=renderToStaticMarkup(<ClaudeRow b={{...booking,key_cash:'30€ Wael'}} kind="out" time="18:20" completed={false} commentCount={1} onOpen={()=>{}}/>);
 expect(html).toContain('cl-chat');expect(html).toContain('cl-people');expect(html).toContain('cl-notes');
 expect(html.indexOf('cl-notes')).toBeLessThan(html.indexOf('cl-bottom'));
 const css=readFileSync('src/claude-theme.css','utf8');
 for(const token of ['rgb(255 255 255 / 17%)','cl-people{fill:none;stroke:currentColor}','height:22px;min-height:22px','letter-spacing:0;font-stretch:normal','font-size:11.5px','padding:3px 7px'])expect(css).toContain(token);
 });
 it('v4 keeps Latin notes left, Arabic note right, green filled payment and smaller numbers',()=>{
 const latin=renderToStaticMarkup(<ClaudeRow b={{...booking,key_cash:'30€ Wael'}} kind="out" time="18:20" completed={false} onOpen={()=>{}}/>);
 expect(latin).not.toContain('cl-note-ar');
 const arabic=renderToStaticMarkup(<ClaudeRow b={{...booking,key_cash:'30€ لازم يدفع'}} kind="out" time="07:10" completed={false} onOpen={()=>{}}/>);
 expect(arabic).toContain('cl-note cl-key cl-note-ar');
 const css=readFileSync('src/claude-theme.css','utf8');
 for(const token of ['background:#E6F6EC','800 26px/34px','calc(20.5px *','cl-note.cl-note-ar{text-align:right}','text-align:left;align-self:stretch'])expect(css).toContain(token);
 });
 it('uses package Lucide icons with 2.5 stroke and filled message square',()=>{
 const html=renderToStaticMarkup(<ClaudeRow b={booking} kind="in" time="12:30" completed={false} onOpen={()=>{}} commentCount={1}/>);
 expect(html).toContain('lucide-arrow-down-left');expect(html).toContain('stroke-width="2.5"');
 expect(html).toContain('lucide-message-square');expect(html).toContain('fill="currentColor"');
 });
 it('exposes a working date control and truthful title',()=>{
 const html=renderToStaticMarkup(<ClaudeTitle date="2026-10-27" today="2026-10-26" lang="en" heading="Open bookings" onDate={()=>{}}/>);expect(html).toContain('Tomorrow');expect(html).toContain('type="date"');
 });
});
