import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {expect,it} from 'vitest';
import {blank} from '../model';
import {ScanResult} from './scan-result';
const n=()=>{};const b={...blank(),id:'1',plate:'D-AB 1',code:'K1',customer_name:'Max'};
it('renders each outcome; jump only as explicit button',()=>{
 expect(r(<ScanResult outcome={{status:'unknown'}} onPick={n} onJump={n} onClose={n}/>)).toContain('Keine Buchung');
 const o=r(<ScanResult outcome={{status:'outside',bookings:[b],jumpDate:'2026-10-20'}} onPick={n} onJump={n} onClose={n}/>);expect(o).toContain('Zum 20.10.2026 springen');expect(o).toContain('außerhalb');
 expect(r(<ScanResult outcome={{status:'outside',bookings:[b,{...b,id:'2'}],jumpDate:null}} onPick={n} onJump={n} onClose={n}/>)).not.toContain('springen');
 expect(r(<ScanResult outcome={{status:'ambiguous',bookings:[b,{...b,id:'2'}]}} onPick={n} onJump={n} onClose={n}/>)).toContain('Mehrere Treffer');
});

it('explains remaining filter exclusion after an explicit jump without offering an automatic reset',()=>{
 const html=r(<ScanResult outcome={{status:'outside',bookings:[b],jumpDate:null,filteredAfterJump:true}} onPick={n} onJump={n} onClose={n}/>);
 expect(html).toContain('Datum gewechselt');expect(html).toContain('aktiven Filter');expect(html).toContain('kein Filter geändert');expect(html).not.toContain('springen');
});
