import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {BookingDetailView} from './booking-detail-view';
import {BookingEditView} from './booking-edit-view';
import {BookingPayment} from './booking-payment-view';
import {bookingDetailsText} from './booking-actions-sheet';
import {blank} from '../model';
const b={...blank(),code:'A1',customer_name:'X',plate:'AB1',total:0.3,paid:0.1+0.2,arrival_at:'2026-10-09T10:00:00Z',departure_at:'2026-10-10T10:00:00Z',status:'confirmed'} as any;
describe('audit fixes',()=>{
 it('float residue is not an outstanding amount',()=>{const h=r(<BookingDetailView booking={b} known flightIn={null} flightOut={null} onBack={()=>{}} onEdit={()=>{}} onStartCheck={()=>{}} onAction={()=>{}}/>);expect(h).not.toContain('Outstanding amount');expect(h).not.toContain('bd-sticky');expect(bookingDetailsText(b)).toMatch(/Due: [^\n]*0,00/)});
 it('edit date inputs have distinct labels',()=>{const h=r(<BookingEditView booking={b} role="admin" onBack={()=>{}} onSave={()=>{}}/>);expect(h).toContain('aria-label="Parking date Datum"');expect(h).toContain('aria-label="Return date Datum"');expect(h).toContain('aria-expanded="false"')});
 it('payment sheet is labelled',()=>{const h=r(<BookingPayment booking={{...b,paid:0,total:10}} recordPayment={async()=>b} onPaid={()=>{}} initialOpen/>);expect(h).toContain('aria-label="Zahlungsart"')});
 it('edit dialog is viewport fixed and payment sheet respects safe area',()=>{expect(readFileSync('src/booking-edit.css','utf8')).toMatch(/\.be-dialog\{position:fixed/);expect(readFileSync('src/booking-payment.css','utf8')).toContain('safe-area-inset-bottom')});
 it('handover leave guard covers key, flight, poor visibility',()=>{const s=readFileSync('src/lib/handover-flow.tsx','utf8');expect(s).toMatch(/key!==\(booking\.key_cash/);expect(s).toMatch(/flight!==/);expect(s).toMatch(/\|\|poor\)setAskLeave/)});
 it('gallery keys ignore video controls and handle fullscreen escape',()=>{const s=readFileSync('src/lib/gallery.tsx','utf8');expect(s).toMatch(/tagName==='VIDEO'/);expect(s).toMatch(/document\.fullscreenElement\)return;if\(full\)/)});
});
