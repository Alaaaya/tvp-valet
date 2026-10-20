// @vitest-environment node
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {demoSeed,type Booking} from '../model';
import {sheetData,sheetsFor,vehicleFields,sheetTitle,sheetDays,euro} from './print-sheets-data';
import {buildSheetsPdf} from './print-sheets';

const base=(o:Partial<Booking>={}):Booking=>({...demoSeed()[0],id:'a',code:'FEF3Y',customer_name:'Petra Jansen',email:'p@x.de',phone:'0163',platform:'Website',product:'Web-V-F',covered:false,
 arrival_at:'2026-10-16T09:15:00.000Z',departure_at:'2026-10-18T15:40:00.000Z',flight_in:'',flight_out:'LH2020',total:60,paid:0,persons:1,plate:'KLE-ZZ111',comment:'',...o});

it('maps customer, dates in Berlin time, flights and days/persons',()=>{
 const s=sheetData(base());
 expect(s).toMatchObject({code:'FEF3Y',name:'Petra Jansen',email:'p@x.de',phone:'0163',source:'Website',plate:'KLE-ZZ111',
  dropoff:'16.10.2026 11:15',pickup:'18.10.2026 17:40',dropoffFlight:'',pickupFlight:'LH2020',daysPersons:'3 / 1',title:'Reservierung (Valet Freifläche)'});
});
it('splits gross price into net + 19 % VAT and outstanding cash',()=>{
 const s=sheetData(base({total:60,paid:0}));
 expect([s.net,s.vat,s.total,s.paid,s.due,s.cashOnSite]).toEqual(['50,42 €','9,58 €','60,00 €','0,00 €','60,00 €','60,00 €']);
 const p=sheetData(base({total:90,paid:90}));expect([p.due,p.paidAmount]).toEqual(['0,00 €','90,00 €']);
 const z=sheetData(base({total:0,paid:0}));expect([z.total,z.net,z.due]).toEqual(['','','']);
 expect(euro(1234.5)).toBe('1.234,50 €');
});
it('reads vehicle JSON from imported notes, else the free car description',()=>{
 expect(vehicleFields({comment:'Fahrzeug: {"brand":"BMW","type":"1er","color":"schwarz"}',car_description:null})).toEqual({brand:'BMW',model:'1er',color:'schwarz'});
 expect(vehicleFields({comment:'',car_description:'VW Golf blau'})).toEqual({brand:'VW Golf blau',model:'',color:''});
 expect(sheetData(base({comment:'Bitte Kindersitz\nFahrzeug: {"brand":"Audi"}'})).remarks).toBe('Bitte Kindersitz');
});
it('titles, day count and one sheet per booking even with arrival+return events',()=>{
 expect(sheetTitle({product:'AP-V-C',covered:true})).toBe('Reservierung (Valet Überdacht)');
 expect(sheetTitle({product:'',covered:false})).toBe('Reservierung');
 expect(sheetDays({arrival_at:'2026-10-16T09:00:00Z',departure_at:'2026-10-16T18:00:00Z'})).toBe(1);
 const a=base(),b=base({id:'b',code:'X2'});
 expect(sheetsFor([{b:a},{b:a},{b}]).map(s=>s.code)).toEqual(['FEF3Y','X2']);
});
it('builds an A4 PDF with one page per booking and no ParkingPro branding',async()=>{
 const png='data:image/png;base64,'+readFileSync('public/icons/favicon-32.png').toString('base64');
 const doc=await buildSheetsPdf(sheetsFor(demoSeed().slice(0,3).map(b=>({b}))),{logo:png,cars:png});
 expect(doc.getNumberOfPages()).toBe(3);
 const size=doc.internal.pageSize;expect([Math.round(size.getWidth()),Math.round(size.getHeight())]).toEqual([210,297]);
 const raw=doc.output();expect(raw).not.toMatch(/parking\s*pro/i);
});
