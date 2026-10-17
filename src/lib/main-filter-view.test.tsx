import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {MainFilterView,parseHours} from './main-filter-view';
import {defaultMainFilters} from './booking-filters';
import {blank} from '../model';
const rows=[{...blank(),product:'FSP-V-F',covered:false},{...blank(),product:'AG-V-C',covered:true}];
const P=(x:any={})=>({filter:defaultMainFilters(),onChange:()=>{},date:'2026-10-17',onDate:()=>{},onClose:()=>{},rows,userId:'u1',...x});
describe('main filter view',()=>{
 it('reference labels',()=>{const h=r(<MainFilterView {...P()}/>);for(const t of ['Filters','Date','Show bookings for','Booking status','Show checked-in/out bookings','Cancelled bookings','Deleted bookings','Rejected bookings','No shows','Assigned to me','Filter airports','Filter product locations','Filter placement locations','Display options','Use flight times','Outbound: use/show flight time','Return: use/show flight time','Hours before date boundary','Hours after date boundary','Type of bookings','Incoming','Outgoing','Service type','Shuttle','Valet/Shuttle','Shuttle/Valet','Reset filters'])expect(h).toContain(t);expect(h).toContain('value="2026-10-17"');expect(h).toContain('aria-modal="true"')});
 it('unsupported fields disabled with reasons',()=>{const h=r(<MainFilterView {...P()}/>);expect(h).toMatch(/disabled=""[^>]*\/?><span>Filter airports|Filter airports<small[^>]*>Keine Flughafen/);expect(h).toContain('Kein Löschstatus');expect(h).toContain('Kein Ablehnungsstatus');expect(h).toMatch(/disabled=""[^>]*>[^<]*(<[^>]+>)*Terminal/)});
 it('assigned disabled without user',()=>{expect(r(<MainFilterView {...P({userId:undefined})}/>)).toContain('Nicht angemeldet')});
 it('flight master disables directions but keeps values',()=>{const on=r(<MainFilterView {...P({filter:{...defaultMainFilters(),flights:false,flOutOn:true}})}/>);expect(on).toContain('Flugzeiten sind aus');expect(on).not.toMatch(/role="switch"[^>]*checked=""[^>]*\/><span>Return/)});
 it('selected product shows actual products',()=>{const h=r(<MainFilterView {...P({filter:{...defaultMainFilters(),products:['AG-V-C']}})}/>);expect(h).toContain('FSP-V-F');expect(h).toContain('AG-V-C')});
 it('outgoing selected red check',()=>{const h=r(<MainFilterView {...P({filter:{...defaultMainFilters(),type:'out'}})}/>);expect(h).toContain('✓ ');expect(h).toMatch(/mf-chip on"[^>]*>(<span[^>]*>✓ <\/span>)Outgoing/)});
 it('hours parsing',()=>{expect(parseHours('0')).toBe(0);expect(parseHours('1,5')).toBe(1.5);expect(parseHours('24')).toBe(24);expect(parseHours('25')).toBeNull();expect(parseHours('-1')).toBeNull();expect(parseHours('')).toBeNull();expect(parseHours('x')).toBeNull()});
 it('css solid, 16px, 44px',()=>{const c=readFileSync('src/main-filter.css','utf8');expect(c).not.toMatch(/gradient|backdrop-filter|blur/);expect(c).toMatch(/min-height:44px/);expect(c).toMatch(/font-size:16px/)});
});
