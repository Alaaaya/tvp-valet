import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {BookingDetailView,serviceInfo,parkingDays,personsLabel,NO_COMMENTS} from './booking-detail-view';
import {blank} from '../model';
const base={...blank(),code:'AF-1',external_id:'206095322',customer_name:'Latifa',phone:'+31',email:'a@b.c',persons:4,plate:'JNG35R',product:'AG-V-C',covered:true,total:60,paid:60,arrival_at:'2026-10-09T10:00:00Z',departure_at:'2026-10-17T12:20:00Z',checked_in_at:'2026-10-09T10:29:00Z'};
const props=(b:any,x:any={})=>({booking:b,known:true,flightIn:<i>IN</i>,flightOut:<i>OUT</i>,onBack:()=>{},onEdit:()=>{},onStartCheck:()=>{},onAction:()=>{},...x});
describe('booking detail view',()=>{
 it('uses the same deduplicated imported notes in detail',()=>{const row=Object.freeze({...base,comment:'Destination = Hurghada\nDestination = Hurghada\nParkingPro source uuid'});const before=JSON.stringify(row);const h=r(<BookingDetailView {...props(row)}/>);expect(h.match(/Destination = Hurghada/g)).toHaveLength(1);expect(JSON.stringify(row)).toBe(before)});
  it('real balances and days',()=>{const h=r(<BookingDetailView {...props(base)}/>);expect(h.replace(/<[^>]*>/g,'')).toContain('Booking #AF-1');expect(h).toMatch(/Total due payable/);expect(h).toMatch(/0,00/);expect(h).toContain('9 days');expect(parkingDays(base)).toBe(9);expect(h).not.toMatch(/Outstanding amount/)});
  it('payment slot under cost, sticky bar only when due',()=>{const h=r(<BookingDetailView {...props({...base,paid:10},{paymentSlot:<i id="pay"/>})}/>);expect(h.indexOf('Total due payable')).toBeLessThan(h.indexOf('id="pay"'));expect(h).toContain('bd-sticky');expect(h).toMatch(/Outstanding amount: (<[^>]*>)?[^<]*50/);expect(r(<BookingDetailView {...props(base)}/>)).not.toContain('bd-sticky')});
  it('no start ride, calledSlot rendered under columns',()=>{const h=r(<BookingDetailView {...props(base,{calledSlot:<b id="cs"/>})}/>);expect(h).not.toMatch(/Start ride|Abholen und Fahrt|ride_started/);expect(h.indexOf('id="cs"')).toBeGreaterThan(h.indexOf('flight-panel in'));expect(h.indexOf('id="cs"')).toBeLessThan(h.indexOf('RETURN DATE'));expect(h.indexOf('id="cs"')).toBeLessThan(h.indexOf('Cost overview'))});
  it('due banner and persons',()=>{const h=r(<BookingDetailView {...props({...base,paid:10})}/>);expect(h).toMatch(/Outstanding amount/);expect(personsLabel(1)).toBe('1 person');expect(personsLabel(0)).toBe('Add number of persons');expect(r(<BookingDetailView {...props(base)}/>)).toContain('4 persons')});
  it('check only when checked in; actual statuses only',()=>{expect(r(<BookingDetailView {...props(base)}/>)).toContain('pp-check');const h=r(<BookingDetailView {...props({...base,checked_in_at:null})}/>);expect(h).not.toContain('pp-check');expect(h).not.toMatch(/Mark as taken away · /)});
  it('ops timestamps shown when real',()=>{const h=r(<BookingDetailView {...props(base,{ops:{booking_id:'x',taken_away_at:'2026-10-09T11:00:00Z',retrieved_at:null,customer_called_at:null,ride_started_at:null,performed_by:'',updated_at:''}})}/>);expect(h).toMatch(/Mark as taken away<\/span><small class="op-at">/);expect(h).not.toMatch(/Has called/)});
  it('service metadata not invented',()=>{expect(serviceInfo({product:'WEB-F',covered:false},'').service).toBe('');expect(serviceInfo({product:'AG-V-C',covered:true},'').service).toBe('Valet');expect(serviceInfo({product:'X',covered:false},'P2 - Überdachte').location).toBe('P2 - Überdachte');expect(serviceInfo({product:'X',covered:false},'').location).toBe('X');const h=r(<BookingDetailView {...props({...base,product:'WEB-F',covered:false})}/>);expect(h).not.toContain('P2')});
  it('mileage dash when unknown',()=>{expect(r(<BookingDetailView {...props({...base,km:null})}/>)).toContain('Mileage: –');expect(r(<BookingDetailView {...props({...base,km:123})}/>).split('Mileage: 123').length).toBe(3)});
  it('odometer capture is device local and not automatic OCR',()=>{const h=r(<BookingDetailView {...props(base)}/>);expect(h).toContain('capture="environment"');expect(h).toContain('odometer-capture');expect(h).toContain('Nothing is saved automatically.');const c=readFileSync('src/lib/odometer-capture.tsx','utf8');expect(c).not.toMatch(/supabase|fetch\(|upload\(/);expect(c).toContain('URL.revokeObjectURL');expect(c).toContain('id!==job.current')});
  it('empty comments and slots',()=>{const h=r(<BookingDetailView {...props(base,{undoSlot:<b id="u"/>,mediaGallery:<div className="mg-grid"><label className="upload">+</label></div>})}/>);expect(h).toContain(NO_COMMENTS);expect(h).toContain('id="u"');expect(h).toContain('bd-media')});
  it('flight green number only region is caller slot',()=>{const h=r(<BookingDetailView {...props(base)}/>);expect(h.indexOf('IN')).toBeLessThan(h.indexOf('OUT'))});
  it('css solid no fog, 16px fields',()=>{const c=readFileSync('src/booking-detail.css','utf8');expect(c).not.toMatch(/gradient|backdrop-filter|blur/);expect(c).toMatch(/font-size:16px/)});
});

it('external ID absent is not invented',()=>{expect(r(<BookingDetailView {...props({...base,external_id:''})}/>)).not.toContain('External ID:');expect(r(<BookingDetailView {...props(base)}/>)).toContain('206095322')});
it('call slot in both columns (owner request Oct 20 2026); taken away in the return column after the call; driver in the parking column',()=>{for(const ci of [null,base.checked_in_at]){const h=r(<BookingDetailView {...props({...base,checked_in_at:ci},{calledSlot:<b className="call-fixture"/>})}/>);expect(h.match(/call-fixture/g)).toHaveLength(2);const first=h.indexOf('call-fixture'),second=h.lastIndexOf('call-fixture');expect(first).toBeGreaterThan(h.indexOf('flight-panel in'));expect(first).toBeLessThan(h.indexOf('flight-panel out'));expect(second).toBeGreaterThan(h.indexOf('flight-panel out'));expect(h.indexOf('Mark as taken away')).toBeGreaterThan(second);expect(h).toContain('Not assigned to driver')}});

it('reference contact counts use supplied real totals outside normal links',()=>{
 const b=Object.freeze({...base,phone:'+49 123',email:'a@b.c',comment:'Fahrzeug: {"description":"Actual car"}'});
 const before=JSON.stringify(b);const h=r(<BookingDetailView {...props(b,{contactCounts:{phone:3,email:1}})}/>);
 expect(h).toContain('bd-contact-count');expect(h).toContain('(3)');expect(h).toContain('(1)');expect(h).toContain('Actual car');expect(h).toContain(' · 9 days');expect(h).toContain('bd-cost-total');expect(JSON.stringify(b)).toBe(before);
});
it('reference typography keeps normal labels, links and flights with bold values',()=>{
 const c=readFileSync('src/booking-detail.css','utf8');
 expect(c).toContain('.bd .bd-label{font-size:14px;font-weight:400');
 expect(c).toContain('.bd .bd-identity a,.bd .pp-link{font-size:14px;font-weight:400');
 expect(c).toContain('.bd .fp-head strong{font-size:14px;font-weight:400');
 expect(c).toContain('.bd .bd-days{display:inline');
 expect(c).toContain('.bd .summary-cost .bd-cost-total{justify-content:flex-end}');
});

it('legitimate optional metadata and payment remain visible in their original sections',()=>{
 const b=Object.freeze({...base,key_cash:'10€ Wael',spot:'P3'});const before=JSON.stringify(b);
 const h=r(<BookingDetailView {...props(b,{productLabel:'Actual catalog label',paymentSlot:<button id="existing-payment">Pay</button>})}/>);
 expect(h).not.toContain('bd-secondary');expect(h).toContain('206095322');expect(h).toContain('P3');expect(h).toContain('10€ Wael');expect(h).toContain('existing-payment');expect(h).toContain('Parken (Actual catalog label)');expect(JSON.stringify(b)).toBe(before);
 expect(h.indexOf('bd-location')).toBeLessThan(h.indexOf('split-handover'));expect(h.indexOf('existing-payment')).toBeLessThan(h.indexOf('summary-location'));
});

it('uses filled reference icons without losing accessible action labels',()=>{
 const h=r(<BookingDetailView {...props({...base,checked_in_at:null})}/>);
 expect(h).toContain('reference-icon-car');expect(h).toContain('reference-icon-calculator');
 expect(h).toContain('reference-icon-checkin');expect(h).toContain('reference-icon-checkout');
 expect(h).toContain('Check-in');expect(h).toContain('Check-out');
 expect(h).toContain('aria-hidden="true"');expect(h).not.toContain('reference-check-action');
});
it('keeps measured reference controls at normal weight and compact solid glyph sizes',()=>{
 const c=readFileSync('src/booking-detail.css','utf8');
 expect(c).toContain('handover-date>button{font-size:12px;font-weight:400}');
 expect(c).toContain('handover-date>button{font-size:12.5px}');
 expect(c).toContain('reference-icon-phone{width:9px;height:9px}');
 expect(c).toContain('summary-cost h3{font-size:14.5px');
 expect(c).toContain('fp-head{position:relative;top:-4px}');
});
it('last reference layer preserves the final control, plane and cost corrections',()=>{
 const c=readFileSync('src/reference-polish.css','utf8');
 expect(c).toContain('handover-date>button{font-size:12.5px;font-weight:400}');
 expect(c).not.toContain('handover-date>button{font-size:12px');
 expect(c).toContain('translateY(.5px) scaleY(1.0714286) rotate(-45deg)');
 expect(c).toContain('summary-cost p:first-of-type>span:first-child{font-weight:400;-webkit-text-stroke:.08px currentColor}');
 expect(c).toContain('summary-cost .bd-days{font-weight:400;color:#999}');
 expect(c).toContain('summary-cost .bd-cost-total{gap:14px}');
 expect(c).toContain('font-size:13px;position:relative;top:-.5px;transform:scaleX(.96);transform-origin:right center');
});
