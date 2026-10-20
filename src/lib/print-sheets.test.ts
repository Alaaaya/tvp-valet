// @vitest-environment node
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {demoSeed,type Booking} from '../model';
import {sheetData,sheetsFor,bookingsForPrintDay,vehicleFields,sheetTitle,sheetDays,euro} from './print-sheets-data';
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
 const z=sheetData(base({total:0,paid:0}));expect([z.total,z.net,z.due]).toEqual(['0,00 €','0,00 €','0,00 €']);
 expect(euro(1234.5)).toBe('1.234,50 €');
});
it('reads only known vehicle fields and leaves missing brand/model/color blank',()=>{
 expect(vehicleFields({comment:'Fahrzeug: {"brand":"BMW","type":"1er","color":"schwarz"}',car_description:null})).toEqual({brand:'BMW',model:'1er',color:'schwarz'});
 expect(vehicleFields({comment:'',car_description:'VW Golf blau'})).toEqual({brand:'',model:'',color:''});
 expect(sheetData(base({comment:'Bitte Kindersitz\nFahrzeug: {"brand":"Audi"}'})).remarks).toBe('Bitte Kindersitz');
});
it('titles, day count and one sheet per booking even with arrival+return events',()=>{
 expect(sheetTitle({product:'AP-V-C',covered:true})).toBe('Reservierung (Valet Überdacht)');
 expect(sheetTitle({product:'',covered:false})).toBe('Reservierung');
 expect(sheetDays({arrival_at:'2026-10-16T09:00:00Z',departure_at:'2026-10-16T18:00:00Z'})).toBe(1);
 const a=base(),b=base({id:'b',code:'X2'});
 expect(sheetsFor([{b:a},{b:a},{b}]).map(s=>s.code)).toEqual(['FEF3Y','X2']);
});
export const assets={template:new Uint8Array(readFileSync('public/print/booking-template.pdf')),regular:new Uint8Array(readFileSync('public/print/LiberationSans-Regular.ttf')),bold:new Uint8Array(readFileSync('public/print/LiberationSans-Bold.ttf'))};
it('builds A4 pages from the actual approved template, one per unique booking',async()=>{
 const doc=await buildSheetsPdf(sheetsFor(demoSeed().slice(0,3).map(b=>({b}))),assets);
 expect(doc.getPageCount()).toBe(3);
 expect(doc.getPages().every(p=>Math.abs(p.getWidth()-595.2756)<.01&&Math.abs(p.getHeight()-841.8898)<.01)).toBe(true);
 const {PDFDocument}=await import('pdf-lib');
 expect((await PDFDocument.load(await doc.save())).getPageCount()).toBe(3);
});
it('selects both scheduled arrival and departure day, ignores status cancellation and deduplicates',()=>{
 const a=base(),b=base({id:'b',arrival_at:'2026-10-01T09:00Z'}),c=base({id:'c',status:'cancelled'});
 expect(bookingsForPrintDay([a,b,c,a],'2026-10-18').map(x=>x.b.id)).toEqual(['a','b']);
 expect(bookingsForPrintDay([a,b,c],'2026-10-16').map(x=>x.b.id)).toEqual(['a']);
 expect(bookingsForPrintDay([a],'2026-10-17')).toEqual([]);
});
it('preserves authoritative paid without adding legacy key cash',()=>{
 expect(sheetData(base({total:100,paid:40,key_cash:'40€ Wael'}))).toMatchObject({paid:'40,00 €',due:'60,00 €'});
});
it('rejects impossible notes instead of silently clipping or adding extra pages',async()=>{
 await expect(buildSheetsPdf([sheetData(base({comment:'Lange Notiz '.repeat(1000)}))],assets)).rejects.toThrow('Text zu lang');
});
it('rejects empty batch rather than producing an empty page',async()=>{
 await expect(buildSheetsPdf([],assets)).rejects.toThrow('Keine Buchungen');
});


it('never substitutes parking descriptions or notes for a missing vehicle brand',()=>{
 expect(vehicleFields({comment:'Fahrzeug: {"brand":null,"type":null,"color":null,"description":"p4🅿️"}',car_description:null})).toEqual({brand:'',model:'',color:''});
});
