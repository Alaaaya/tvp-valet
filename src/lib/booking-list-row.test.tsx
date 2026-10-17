import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {BookingListRow,partnerBadge,moneyState} from './booking-list-row';
import {blank} from '../model';
const b={...blank(),code:'AF-1',plate:'JNG35R',customer_name:'Latifa',product:'AG-V-F',total:60,paid:10,key_cash:'30€ Wael',persons:2};
const P=(x:any={})=>({b,kind:'out' as const,time:'12:00',completed:false,onOpen:()=>{},...x});
describe('booking list row',()=>{
 it('maps partner badges only for real products',()=>{expect(partnerBadge({product:'AG-V-F',platform:''})?.label).toBe('AvioGo');expect(partnerBadge({product:'AP-V-C',platform:''})?.cls).toBe('ap');expect(partnerBadge({product:'FSP-V-F',platform:''})?.cls).toBe('fsp');expect(partnerBadge({product:'x',platform:'ParkingList'})?.cls).toBe('pl');expect(partnerBadge({product:'F2M-V-F',platform:''})?.label).toBe('Free2Move');expect(partnerBadge({product:'x',platform:'Free 2 Move'})?.cls).toBe('f2m');expect(partnerBadge({product:'x',platform:'Free2Move'})?.cls).toBe('f2m');expect(partnerBadge({product:'WEB-V-F',platform:''})?.cls).toBe('web');expect(partnerBadge({product:null,platform:'Website'})?.cls).toBe('web');expect(partnerBadge({product:null,platform:null})).toBeNull();expect(partnerBadge({product:'x',platform:'other'})).toBeNull();expect(r(<BookingListRow {...P()}/>)).toContain('AG-V-F');expect(r(<BookingListRow {...P()}/>)).toContain('#AF-1');expect(r(<BookingListRow {...P({b:{...b,product:'',platform:''}})}/>)).not.toContain('blr-badge')});
 it('no fake payment processor',()=>{const h=r(<BookingListRow {...P()}/>);expect(h).not.toMatch(/MOLLIE|PAYPAL|SYSTEM|VIA PARTNER/i);expect(h).toContain('offen');expect(moneyState({total:0,paid:0}).kind).toBe('none')});
 it('phone icon only with phone',()=>{expect(r(<BookingListRow {...P()}/>)).not.toContain('Telefon');expect(r(<BookingListRow {...P({b:{...b,phone:'+49'}})}/>)).toContain('Telefon')});
 it('comment is human text, never raw json; count only when real',()=>{const raw='ParkingPro source abc\nFahrzeug: {"brand":"VW"}\nBitte anrufen';const h=r(<BookingListRow {...P({b:{...b,comment:raw}})}/>);expect(h).toContain('Bitte anrufen');expect(h).not.toContain('brand');expect(h).not.toContain('blr-cc');expect(r(<BookingListRow {...P({commentCount:3})}/>)).toContain('blr-cc')});
 it('real key and check only when done',()=>{expect(r(<BookingListRow {...P()}/>)).toContain('30€ Wael');expect(r(<BookingListRow {...P()}/>)).not.toContain('blr-check');expect(r(<BookingListRow {...P({b:{...b,checked_out_at:'2026-10-17T10:00:00Z'},completed:true})}/>)).toContain('blr-check')});
 it('flight only when known; live slot wins',()=>{expect(r(<BookingListRow {...P()}/>)).not.toContain('blr-tf');expect(r(<BookingListRow {...P({b:{...b,flight_out:'BY123'}})}/>)).toContain('blr-tf');expect(r(<BookingListRow {...P({b:{...b,flight_out:'BY123'}})}/>)).toContain('BY123');expect(r(<BookingListRow {...P({live:<i id="lv"/>})}/>)).toContain('id="lv"')});
 it('css solid, readable',()=>{const c=readFileSync('src/booking-list-row.css','utf8');expect(c).not.toMatch(/gradient|backdrop-filter|blur/);expect(c).toMatch(/min-height:44px/)});
});
