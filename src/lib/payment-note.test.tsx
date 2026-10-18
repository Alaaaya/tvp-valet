import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {hasPaymentInstruction as h,paymentInstruction} from './payment-note';
import {BookingListRow} from './booking-list-row';
import {blank} from '../model';
const b={...blank(),code:'X1',plate:'AB1',customer_name:'K'};
const P=(x:any={})=>({b,kind:'in' as const,time:'10:00',completed:false,onOpen:()=>{},...x});
describe('payment note',()=>{
 it('matches casings and layouts',()=>{for(const t of ['Muss10€zahlen','MUSS 10 € ZAHLEN','10€ muss zahlen','zahlen 5,50€','muss\n20€ zahlen'])expect(h(t),t).toBe(true)});
 it('non matches',()=>{for(const t of ['unpaid','Müssen wir 50,00 Euro bezahlen?','10€ Wael','Bitte anrufen',''])expect(h(t),t).toBe(false)});
 it('reads imported vehicle description',()=>{expect(paymentInstruction({comment:'ParkingPro source u\nFahrzeug: {"description":"10€muss zahlen"}\nStandort: P1'})).toBe('10€muss zahlen')});
 it('row purple, escaped, done states',()=>{const x={...b,comment:'Muss 10€ zahlen <img src=x onerror=1>',checked_in_at:'2026-10-17T08:00:00Z'};const o=r(<BookingListRow {...P({b:x,completed:true})}/>);expect(o).toContain('pay-note');expect(o).toContain('blr-check');expect(o).not.toContain('<img');expect(r(<BookingListRow {...P()}/>)).not.toContain('pay-note')});
 it('css whole row incl timebox, black plate',()=>{const c=readFileSync('src/payment-note.css','utf8');expect(c).toMatch(/\.blr\.pay-note \.blr-main/);expect(c).toMatch(/\.blr\.out\.pay-note\.done \.blr-time/);expect(c).toMatch(/\.blr-plate[^}]*#111/);expect(c).not.toMatch(/innerHTML|blur|gradient/)});
});
