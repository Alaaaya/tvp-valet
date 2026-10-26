import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {readTheme,writeTheme,THEME_KEY} from './theme';
import {BookingListRow} from './booking-list-row';
import type {Booking} from '../model';
describe('Masar theme preview',()=>{
 it('is a ninth opt-in choice, retaining fallback',()=>{
  const data:Record<string,string>={};writeTheme({setItem:(k,v)=>{data[k]=v}},'masar');
  expect(data[THEME_KEY]).toBe('masar');expect(readTheme({getItem:()=> 'masar'})).toBe('masar');expect(readTheme({getItem:()=> 'unknown'})).toBe('classic');
 });
 it('keeps all CSS isolated and reduced motion supported',()=>{
  const css=readFileSync('src/masar-theme.css','utf8');
  expect(css).not.toMatch(/data-theme=(?:classic|nana|zaitoun|layl|safa|echt|azraq|samawi)/);
  expect(css).toContain('prefers-reduced-motion');expect(css).toContain('direction:ltr');
 });
 it('renders the reference row structure with real booking data',()=>{
 const b={id:'test',plate:'D-MS 240',customer_name:'Martin Schneider',flight_in:'LH2031',total:65,paid:65,persons:2,platform:'Web',product:'WEB-V-F',code:'TEST',covered:false} as Booking;
 const html=renderToStaticMarkup(<BookingListRow b={b} kind="in" time="09:15" completed={false} onOpen={()=>{}}/>);
 for(const text of ['D-MS 240','Martin Schneider','LH2031','09:15','blr-side','blr-cover','blr-pay'])expect(html).toContain(text);
 });
});
