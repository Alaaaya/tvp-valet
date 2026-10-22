import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {BookingListRow,partnerBadge,moneyState,directionCounts} from './booking-list-row';
import {blank} from '../model';
const b={...blank(),code:'AF-1',plate:'JNG35R',customer_name:'Latifa',product:'AG-V-F',total:60,paid:10,key_cash:'30€ Wael',persons:2};
const P=(x:any={})=>({b,kind:'out' as const,time:'12:00',completed:false,onOpen:()=>{},...x});
describe('booking list row',()=>{
 it('deduplicates imported display lines without changing the booking',()=>{const row=Object.freeze({...b,comment:'Destination = Hurghada\nDestination = Hurghada\nParkingPro source uuid'});const before=JSON.stringify(row);const h=r(<BookingListRow {...P({b:row})}/>);expect(h.replace(/title="[^"]*"/g,'').match(/Destination = Hurghada/g)).toHaveLength(1);expect(JSON.stringify(row)).toBe(before)});
 it('maps partner badges only for real products',()=>{expect(partnerBadge({product:'AG-V-F',platform:''})?.label).toBe('AvioGo');expect(partnerBadge({product:'AP-V-C',platform:''})?.cls).toBe('ap');expect(partnerBadge({product:'FSP-V-F',platform:''})?.cls).toBe('fsp');expect(partnerBadge({product:'x',platform:'ParkingList'})?.cls).toBe('pl');expect(partnerBadge({product:'F2M-V-F',platform:''})?.label).toBe('Free2Move');expect(partnerBadge({product:'x',platform:'Free 2 Move'})?.cls).toBe('f2m');expect(partnerBadge({product:'x',platform:'Free2Move'})?.cls).toBe('f2m');expect(partnerBadge({product:'WEB-V-F',platform:''})?.cls).toBe('web');expect(partnerBadge({product:null,platform:'Website'})?.cls).toBe('web');expect(partnerBadge({product:null,platform:null})).toBeNull();expect(partnerBadge({product:'x',platform:'other'})).toBeNull();expect(r(<BookingListRow {...P()}/>)).toContain('AG-V-F');expect(r(<BookingListRow {...P()}/>)).toContain('#AF-1');expect(r(<BookingListRow {...P({b:{...b,product:'',platform:''}})}/>)).not.toContain('blr-badge')});
 it('no fake payment processor',()=>{const h=r(<BookingListRow {...P()}/>);expect(h).not.toMatch(/MOLLIE|PAYPAL|SYSTEM|VIA PARTNER/i);expect(h).toContain('Offen | ');expect(moneyState({total:0,paid:0}).kind).toBe('none')});
 it('payment pill is one localized line from stored amount',()=>{expect(moneyState({total:70,paid:70}).text).toBe('Bezahlt | 70,00\u00a0€');expect(moneyState({total:70,paid:20}).text).toBe('Offen | 50,00\u00a0€');const c=readFileSync('src/booking-list-row.css','utf8');expect(c).toMatch(/\.blr-pay\{flex:none;white-space:nowrap/)});
 it('phone icon only after the customer called',()=>{expect(r(<BookingListRow {...P({b:{...b,phone:'+49'}})}/>)).not.toContain('Kundenanruf');expect(r(<BookingListRow {...P({callCounterSlot:<span>1h</span>})}/>)).toContain('Kundenanruf')});
 it('comment is human text, never raw json; count only when real',()=>{const raw='ParkingPro source abc\nFahrzeug: {"brand":"VW"}\nBitte anrufen';const h=r(<BookingListRow {...P({b:{...b,comment:raw}})}/>);expect(h).toContain('Bitte anrufen');expect(h).not.toContain('brand');expect(h).not.toContain('blr-cc');expect(r(<BookingListRow {...P({commentCount:3})}/>)).toContain('blr-cc')});
 it('real key and check only when done',()=>{expect(r(<BookingListRow {...P()}/>)).toContain('30€ Wael');expect(r(<BookingListRow {...P()}/>)).not.toContain('blr-check');expect(r(<BookingListRow {...P({b:{...b,checked_out_at:'2026-10-17T10:00:00Z'},completed:true})}/>)).toContain('blr-check')});
 it('keeps known flight number in timebox but omits status slot',()=>{expect(r(<BookingListRow {...P()}/>)).not.toContain('blr-tf');expect(r(<BookingListRow {...P({b:{...b,flight_out:'BY123'}})}/>)).toContain('blr-tf');expect(r(<BookingListRow {...P({b:{...b,flight_out:'BY123'}})}/>)).toContain('BY123');expect(r(<BookingListRow {...P({live:<i id="lv"/>})}/>)).not.toContain('id="lv"')});
 it('call counter slot only when supplied, no start-ride hint',()=>{const h0=r(<BookingListRow {...P()}/>);expect(h0).not.toContain('blr-calls');const h=r(<BookingListRow {...P({callCounterSlot:<i id="cc"/>})}/>);expect(h).toContain('id="cc"');expect(h).toContain('blr-calls');expect(h0+h).not.toMatch(/start ride|fahrt starten/i)});
 it('css solid, readable',()=>{const c=readFileSync('src/booking-list-row.css','utf8');expect(c).not.toMatch(/gradient|backdrop-filter|blur/);expect(c).toMatch(/min-height:158px/)});
});

describe('actual flight time and call chips',()=>{
 it('actual flight time under plane only when valid',()=>{const h=r(<BookingListRow {...P({b:{...b,flight_out:'BY1',actual_flight_out:'2026-10-17T10:00:00Z'}})}/>);expect(h).toContain('blr-actual-flight');expect(r(<BookingListRow {...P({b:{...b,flight_out:'BY1',actual_flight_out:'junk'}})}/>)).not.toContain('blr-actual-flight');expect(r(<BookingListRow {...P()}/>)).not.toContain('blr-actual-flight')});
 it('call chip css hides cc-main visually, keeps it',()=>{const c=readFileSync('src/booking-list-row.css','utf8');expect(c).toMatch(/\.blr \.call-counter \.cc-main\{position:absolute/)});
 it('no fabricated comment count',()=>{expect(r(<BookingListRow {...P({b:{...b,comment:'a\nb\nc'}})}/>)).not.toContain('blr-cc')});
});
describe('completed rows and counters',()=>{
 const inB={...b,checked_in_at:'2026-10-17T08:00:00Z'},outB={...b,checked_out_at:'2026-10-17T10:00:00Z'};
 it('completed in: check inside timebox, none in plate line',()=>{const h=r(<BookingListRow {...P({kind:'in',b:inB,completed:true})}/>);expect(h).toContain('blr in done');expect(h).toMatch(/blr-time"><span class="blr-check"/);expect(h.match(/blr-check/g)?.length).toBe(1)});
 it('completed out and open rows',()=>{expect(r(<BookingListRow {...P({b:outB,completed:true})}/>)).toMatch(/blr out done.*blr-time"><span class="blr-check"/);const o=r(<BookingListRow {...P()}/>);expect(o).not.toContain('blr-check');expect(o).not.toContain(' done')});
 it('open in row with no check even if other direction stamp',()=>{expect(r(<BookingListRow {...P({kind:'in',b:outB,completed:false})}/>)).not.toContain('blr-check')});
 it('directionCounts done/total',()=>{const ev=[{kind:'in' as const,completed:true},{kind:'in' as const},{kind:'out' as const,completed:true},{kind:'out' as const,completed:true},{kind:'out' as const}];expect(directionCounts(ev,'in')).toEqual({done:1,total:2});expect(directionCounts(ev,'out')).toEqual({done:2,total:3});expect(directionCounts([],'in')).toEqual({done:0,total:0})});
 it('css: white completed box with colored stripe',()=>{const c=readFileSync('src/booking-list-row.css','utf8');expect(c).toContain('.blr.done .blr-time{background:#fff;border-left:8px solid #2e9e5b}');expect(c.indexOf('.blr.done .blr-time')).toBeLessThan(c.indexOf('.blr-body'));expect(c).toContain('.blr.out.done .blr-time{background:#fff;border-left-color:#d23b3b}')});
});

it('product is on a separate first line before the primary plate and key line',()=>{
 const h=r(<BookingListRow {...P()}/>);
 expect(h).toMatch(/blr-l1[^]*AG-V-F[^]*<\/span>[^]*blr-line blr-l2/);
 expect(h).toContain('title="JNG35R · 30€ Wael · AF-1"');
});
it('actual flight clock is rendered only from a valid stored directional timestamp',()=>{
 const h=r(<BookingListRow {...P({b:{...b,actual_flight_out:'2026-10-17T10:33:00Z'}})}/>);
 expect(h).toContain('blr-actual-flight');expect(h).toContain('12:33');
 expect(r(<BookingListRow {...P({b:{...b,actual_flight_out:'not-time'}})}/>)).not.toContain('blr-actual-flight');
 expect(r(<BookingListRow {...P({kind:'in',b:{...b,actual_flight_out:'2026-10-17T10:33:00Z'}})}/>)).not.toContain('blr-actual-flight');
});

it('keeps plate, key and codes on one line with the plate never shrinking',()=>{
 const h=r(<BookingListRow {...P()}/>);
 expect(h).not.toContain('blr-reference');
 expect(h).toMatch(/blr-l2"[^]*?blr-plate[^]*?blr-code[^]*?blr-l3/);
 expect(h).toMatch(/blr-l2" title="[^"]*·/);
 const c=readFileSync('src/booking-list-row.css','utf8');
 expect(c).toContain('.blr-l2 .blr-plate{flex:0 0 auto');
 expect(c).toContain('.blr-l2 .blr-code{flex:0 1 auto');
});

it('omits external IDs from row text and tooltip while preserving booking code and input data',()=>{
 for(const external_id of ['198183538','AL-750762123']){
  const row=Object.freeze({...b,external_id}),before=JSON.stringify(row);
  const h=r(<BookingListRow {...P({b:row})}/>);
  expect(h).not.toContain(external_id);
  expect(h).toContain('#AF-1');
  expect(JSON.stringify(row)).toBe(before);
 }
});

it('retains directional flight clock and number but no separate live status line',()=>{
 const h=r(<BookingListRow {...P({b:{...b,flight_out:'NP855',actual_flight_out:'2026-10-17T10:33:00Z'},live:<small>landed +21′</small>})}/>);
 expect(h).toContain('NP855');expect(h).toContain('12:33');expect(h).toContain('blr-tf');
 expect(h).not.toContain('landed');expect(h).not.toContain('blr-flight');
});

it('hides an exact external-ID provenance token in list comments and tooltip only',()=>{
 const row=Object.freeze({...b,external_id:'DP-YWJ4U9G',comment:'Flughafenstellplatz | DP-YWJ4U9G | Travel Valet Parking | Online vorausbezahlt, keine Barzahlung vor Ort.'}),before=JSON.stringify(row);
 const h=r(<BookingListRow {...P({b:row})}/>);
 expect(h).not.toContain('DP-YWJ4U9G');
 expect(h).toContain('Online vorausbezahlt, keine Barzahlung vor Ort.');
 expect(h).toContain('Travel Valet Parking');
 expect(h).toContain('#AF-1');
 expect(JSON.stringify(row)).toBe(before);
});

it('hides exact compound partner external references without changing stored provenance',()=>{
 const row=Object.freeze({...b,external_id:'Flughafenstellplatz | DP-EVJ5U9Z',comment:'Flughafenstellplatz | DP-EVJ5U9Z | Travel Valet Parking | Online vorausbezahlt, keine Barzahlung vor Ort.'}),before=JSON.stringify(row);
 const h=r(<BookingListRow {...P({b:row})}/>);
 expect(h).not.toContain('DP-EVJ5U9Z');
 expect(h).toContain('Travel Valet Parking');
 expect(h).toContain('Online vorausbezahlt, keine Barzahlung vor Ort.');
 expect(h).toContain('#AF-1');
 expect(JSON.stringify(row)).toBe(before);
});

it('called row: "seit N Min" sits inline on the name line and the undo button lives inside the row',()=>{
 const h=r(<BookingListRow {...P({callCounterSlot:<i id="cc"/>,callClearSlot:<button type="button" className="row-call-clear">x</button>})}/>);
 expect(h).toMatch(/blr-line blr-l3">[^]*blr-name[^]*<span class="blr-calls"><i id="cc"><\/i><\/span><\/span>/);
 expect(h).toContain('blr out called has-call-clear');
 expect(r(<BookingListRow {...P()}/>)).not.toMatch(/called|has-call-clear/);
 const c=readFileSync('src/row-call.css','utf8'),base=readFileSync('src/booking-list-row.css','utf8');
 expect(base).not.toMatch(/own strip|margin:0 6px 3px auto/);
 expect(c).toMatch(/\.blr>\.row-call-clear[^{]*\{position:absolute;top:50%;inset-inline-end:4px;[^}]*width:32px;min-width:32px;[^}]*min-height:32px/);
 expect(c).toMatch(/\.blr\.has-call-clear \.blr-side[^{]*\{padding-inline-end:36px\}/);
 expect(c).toMatch(/\.blr-l3>\.blr-calls[^{]*\{flex:0 0 auto/);
 expect(c).toContain('.blr .blr-main{align-items:stretch}');
 expect(readFileSync('src/main.tsx','utf8')).toMatch(/reference-match-detail-style\.css';import '\.\/row-call\.css'/);
});
