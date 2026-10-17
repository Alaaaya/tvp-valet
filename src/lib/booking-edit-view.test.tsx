import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {BookingEditView,toDraft,isDirty,buildPatch,validate,appendComment,canEdit} from './booking-edit-view';
import {blank} from '../model';
const b:any={...blank(),customer_name:'Pim Mulder',phone:'+31',email:'a@b.c',persons:4,plate:'K775RL',key_cash:'10€',external_id:'267462468',arrival_at:'2026-10-17T03:15:00Z',departure_at:'2026-10-22T13:20:00Z',comment:'Hallo\nParkingPro source X\n{"source":"pp"}'};
describe('booking edit',()=>{
 it('legacy name not split',()=>{const x=toDraft(b);expect(x.first_name).toBe('');expect(x.last_name).toBe('');expect(buildPatch(b,{...x,phone:'1'},'admin').customer_name).toBeUndefined();expect(r(<BookingEditView booking={b} role="admin" onBack={()=>{}} onSave={()=>{}}/>)).toContain('Pim Mulder')});
 it('explicit names',()=>{const p=buildPatch(b,{...toDraft(b),first_name:'Pim',last_name:'Mulder'},'admin');expect(p).toMatchObject({first_name:'Pim',last_name:'Mulder',customer_name:'Pim Mulder'})});
 it('dirty + disabled save',()=>{expect(isDirty(b,toDraft(b))).toBe(false);const h=r(<BookingEditView booking={b} role="admin" onBack={()=>{}} onSave={()=>{}}/>);expect(h.match(/disabled=""[^>]*>(Save|<svg)/g)?.length||0).toBeGreaterThan(0);expect(h).toContain('Update booking');expect(buildPatch(b,toDraft(b),'admin')).toEqual({})});
 it('driver limited',()=>{expect(canEdit('driver','plate')).toBe(false);expect(canEdit('driver','key_cash')).toBe(true);const p=buildPatch(b,{...toDraft(b),plate:'X',key_cash:'20€',new_comment:'n'},'driver');expect(p.plate).toBeUndefined();expect(p.key_cash).toBe('20€');expect(p.comment).toContain('n')});
 it('validation',()=>{const x=toDraft(b);expect(validate(b,{...x,departure_date:'2026-10-01'}).length).toBe(1);expect(validate(b,{...x,persons:0}).length).toBe(1);expect(validate({...b,persons:0},{...x,persons:0})).toEqual([])});
 it('berlin time',()=>{const x=toDraft(b);expect(x.arrival_time).toBe('05:15');expect(buildPatch(b,{...x,arrival_time:'06:00'},'admin').arrival_at).toBe('2026-10-17T04:00:00.000Z')});
 it('comment keeps provenance',()=>{const c=appendComment(b.comment,'neu');expect(c).toContain('{"source":"pp"}');expect(c.indexOf('neu')).toBeLessThan(c.indexOf('ParkingPro source'));expect(c.startsWith('Hallo')).toBe(true)});
 it('css solid 16px',()=>{const c=readFileSync('src/booking-edit.css','utf8');expect(c).not.toMatch(/gradient|backdrop-filter|blur/);expect(c).toMatch(/font-size:16px/)});
});
