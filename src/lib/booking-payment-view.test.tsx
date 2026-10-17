import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {BookingPayment,parseEuroToCents,validateAmount,dueCents,fmtEur} from './booking-payment-view';
import {blank} from '../model';
const b:any={...blank(),id:'1',total:83,paid:10.1};
const P=(x:any={})=>({booking:b,onPaid:()=>{},recordPayment:async()=>b,...x});
describe('booking payment',()=>{
 it('parses cents exactly',()=>{expect(parseEuroToCents('25,50')).toBe(2550);expect(parseEuroToCents('0.1')).toBe(10);expect(parseEuroToCents('19.99')).toBe(1999);expect(parseEuroToCents('1,005')).toBeNull();expect(parseEuroToCents('-5')).toBeNull();expect(parseEuroToCents('')).toBeNull();expect(parseEuroToCents('abc')).toBeNull()});
 it('due without float drift',()=>{expect(dueCents(b)).toBe(7290);expect(dueCents({total:0.3,paid:0.1})).toBe(20);expect(dueCents({total:5,paid:9})).toBe(0);expect(fmtEur(7290)).toBe('72,90 €')});
 it('rejects zero, negative, overpay; allows partial and full',()=>{expect(validateAmount('0',100).error).toBeTruthy();expect(validateAmount('-1',100).error).toBeTruthy();expect(validateAmount('1,01',100).error).toContain('höher');expect(validateAmount('1',100).cents).toBe(100);expect(validateAmount('0,50',100).cents).toBe(50)});
 it('cash first, three methods, amount prefilled with due',()=>{const h=r(<BookingPayment {...P({initialOpen:true})}/>);expect(h.indexOf('Bargeld')).toBeLessThan(h.indexOf('Karte'));expect(h.indexOf('Karte')).toBeLessThan(h.indexOf('Überweisung'));expect(h).toContain('value="72,90"')});
 it('email/QR disabled with bald',()=>{const h=r(<BookingPayment {...P()}/>);expect((h.match(/disabled=""[^>]*>[^<]*(E-Mail|QR)/g)||[]).length).toBe(3);expect(h).toContain('bald')});
 it('disabled or no backend: cannot pay',()=>{expect(r(<BookingPayment {...P({disabled:true})}/>)).toMatch(/bpay-main"[^>]*disabled/);expect(r(<BookingPayment {...P({recordPayment:undefined})}/>)).toMatch(/bpay-main"[^>]*disabled/)});
 it('fully paid hides pay button',()=>{expect(r(<BookingPayment {...P({booking:{...b,paid:83}})}/>)).not.toContain('Als bezahlt');});
 it('css solid, touch, 16px',()=>{const c=readFileSync('src/booking-payment.css','utf8');expect(c).not.toMatch(/gradient|backdrop-filter|blur/);expect(c).toMatch(/min-height:44px/);expect(c).toMatch(/font-size:16px/)});
});
