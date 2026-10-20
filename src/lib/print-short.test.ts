import {expect,it} from 'vitest';
import fs from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {blank,utc,type Booking} from '../model';
import {buildShortPdf,shortSheet,SHORT_PAGE} from './print-short';
const row=(patch:Partial<Booking>={}):Booking=>({...blank(),id:'a',code:'NOT-A-SHEET-NUMBER',external_id:'NEVER-NUMBER',spot:'17',plate:'d-ä 12',customer_name:'Kaplan Hüseyin',arrival_at:'2026-10-18T02:20Z',departure_at:'2026-10-23T22:25Z',flight_out:'EW9547',...patch});
it('uses the actual numeric Parkplatzcode, never a selection index or booking identifier',()=>{
 expect(shortSheet(row()).number).toBe('17');
 for(const spot of ['',null,'QA-FEATURE-ONLY','A12']as any[])expect(shortSheet(row({spot})).number).toBe('');
 expect(shortSheet(row({spot:'004'})).number).toBe('004');
});
it('uses scheduled Berlin stamps, return flight, real name and omits fake or missing plates',()=>{
 expect(shortSheet(row())).toEqual({number:'17',plate:'D-Ä 12',arrivalDate:'18.10',arrivalTime:'04:20',returnDate:'24.10',returnTime:'00:25',flight:'EW9547',name:'Kaplan Hüseyin'});
 for(const plate of ['',null,' aa-test-bb ']as any[])expect(shortSheet(row({plate})).plate).toBe('');
 expect(shortSheet(row({customer_name:'',first_name:'Aya',last_name:'Müller',flight_in:'WRONG',flight_out:''}))).toMatchObject({name:'Aya Müller',flight:''});
});
it('two real bookings per A4, odd final half blank, deduplication and no data mutations',async()=>{
 for(const n of [1,2,3,4,5]){
  const items=Array.from({length:n},(_,i)=>({b:Object.freeze(row({id:String(i),spot:String(i+10)}))}));const before=JSON.stringify(items);
  const doc=await buildShortPdf(items);expect(doc.getPageCount()).toBe(Math.ceil(n/2));
  expect(doc.getPage(0).getSize()).toEqual(SHORT_PAGE);expect(JSON.stringify(items)).toBe(before);
  expect((await PDFDocument.load(await doc.save())).getPageCount()).toBe(Math.ceil(n/2));
 }
 expect((await buildShortPdf([{b:row()},{b:row()}])).getPageCount()).toBe(1);
 await expect(buildShortPdf([])).rejects.toThrow('Keine Buchungen');
});
it('uses PDF text rather than HTML, preserves German characters and silently drops unsupported code points',async()=>{
 await expect(buildShortPdf([{b:row({customer_name:'<script> & ÄÖÜ äöü ß Hüseyin'})}])).resolves.toBeTruthy();
 await expect(buildShortPdf([{b:row({customer_name:'علاء'})}])).resolves.toBeTruthy();
});
it('renders the exact approved sample data for pixel comparison',async()=>{
 const values=[
 ['','18','23','04:20','00:25','','Engelbertus Jacobs'],['','18','22','06:55','00:40','','Charlotte van de Ven'],
 ['SO MC 76','18','27','08:00','17:05','EW9547','Michael Schlak'],['','18','24','09:10','14:45','','Stefan Jansen'],
 ['TUT-SZ-218','18','23','10:00','18:00','','Christian Stein'],['RE CE 7815','18','26','11:00','14:00','XQ184','David Elsner'],
 ['2HPR-698','18','25','12:00','20:30','EK57','Raia Mike'],['JSH91D','18','24','14:00','19:00','','Rene de Ruijter'],
 ['K-NJ1314','18','31','16:15','03:00','','Sarah Lanzerath'],['DH-XF333','18','31','16:15','03:00','','Roman Lasota'],
 ['DH-XF999','18','31','16:15','03:45','','Sarah Lanzerath'],['5 STZ 51','18','25','17:00','17:00','VF-5','Kaplan Hüseyin']];
 const items=values.map(([plate,a,d,at,dt,flight_out,customer_name],i)=>({b:row({id:String(i),spot:String(i+1),plate,flight_out,customer_name,arrival_at:utc(`2026-10-${a}T${at}`),departure_at:utc(`2026-10-${d}T${dt}`)})}));
 const doc=await buildShortPdf(items);expect(doc.getPageCount()).toBe(6);
 if(process.env.SHORT_PROOF)fs.writeFileSync(process.env.SHORT_PROOF,await doc.save());
});

it('prints Arabic-only, mixed, emoji, NFC and long mixed fields without mutating bookings',async()=>{
 const fallback={regular:new Uint8Array(fs.readFileSync('public/print/LiberationSans-Regular.ttf')),bold:new Uint8Array(fs.readFileSync('public/print/LiberationSans-Bold.ttf'))};
 for(const customer_name of ['آية محمد عبدالله','Alaa علاء 123 😀 Äöüß € –','Mu\u0308ller 😀','اسم😀'.repeat(300)+'Müller']){
  const items=[{b:row({customer_name,flight_out:'علاء EW 123 😀',plate:'D علاء Ä 12 😀'})}];
  const before=JSON.stringify(items);for(const fonts of [undefined,fallback]){
   const doc=await buildShortPdf(items,fonts);expect((await doc.save()).length).toBeGreaterThan(1000);
  }expect(JSON.stringify(items)).toBe(before);
 }
});
