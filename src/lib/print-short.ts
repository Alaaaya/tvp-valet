// The approved gut.py layout, in PDF points. No template, booking code, QR or database writes.
import {PDFDocument,StandardFonts,rgb,type PDFFont,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type {Booking} from '../model';
import {COMPANY,sheetStamp} from './print-sheets-data';

export type ShortSheet={number:string;plate:string;arrivalDate:string;arrivalTime:string;returnDate:string;returnTime:string;flight:string;name:string};
const clean=(value:string|null|undefined)=>(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim();
/** spot is the stored Parkplatzcode. Never substitute a booking code or this selection's index. */
export function shortSheet(b:Booking):ShortSheet{
 const arrival=sheetStamp(b.arrival_at).split(' '),back=sheetStamp(b.departure_at).split(' '),plate=clean(b.plate).toUpperCase();
 const spot=clean(b.spot);
 return{number:/^\d+$/.test(spot)?spot:'',plate:plate==='AA-TEST-BB'?'':plate,
  arrivalDate:(arrival[0]||'').slice(0,5),arrivalTime:arrival[1]||'',returnDate:(back[0]||'').slice(0,5),returnTime:back[1]||'',
  flight:clean(b.flight_out),name:clean(b.customer_name)||[clean(b.first_name),clean(b.last_name)].filter(Boolean).join(' ')};
}
export const SHORT_PAGE={width:595.2755905511812,height:841.8897637795277};
export async function buildShortPdf(items:readonly {b:Booking}[],fallback?:{regular:Uint8Array;bold:Uint8Array}):Promise<PDFDocument>{
 const seen=new Set<string>(),sheets:ShortSheet[]=[];
 for(const {b}of items){if(!seen.has(b.id)){seen.add(b.id);sheets.push(shortSheet(b))}}
 if(!sheets.length)throw new Error('Keine Buchungen für diesen Tag.');
 const doc=await PDFDocument.create();
 const regular=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold);
 let extra:Promise<{regular:PDFFont;bold:PDFFont}>|undefined;
 const fontFor=async(text:string,isBold:boolean)=>{
  const f=isBold?bold:regular;
  try{f.encodeText(text);return f}catch{
   if(!fallback)throw new Error('Zeichen werden von der Druckschrift nicht unterstützt.');
   doc.registerFontkit(fontkit);
   extra??=Promise.all([doc.embedFont(fallback.regular,{subset:true}),doc.embedFont(fallback.bold,{subset:true})]).then(([regular,bold])=>({regular,bold}));
   const fonts=await extra,ff=isBold?fonts.bold:fonts.regular,supported=new Set(ff.getCharacterSet());
   if(Array.from(text).some(c=>!supported.has(c.codePointAt(0)!)))throw new Error('Zeichen werden von der Druckschrift nicht unterstützt.');
   return ff;
  }
 };
 const text=async(page:PDFPage,value:string,x:number,y:number,size:number,isBold=false,center=false,maxWidth=SHORT_PAGE.width-100)=>{
  if(!value)return;
  if(value.length>6000)throw new Error('Text zu lang für ein Kurz-Blatt.');
  const font=await fontFor(value,isBold);
  // ReportLab drawCentredString uses unkerned Helvetica advances; pdf-lib's width helper
  // includes kerning even though drawText emits a plain Tj. Sum advances to match gut.py.
  const measure=(n:number)=>font===regular||font===bold?Array.from(value).reduce((w,c)=>w+font.widthOfTextAtSize(c,n),0):font.widthOfTextAtSize(value,n);
  const width=measure(size);
  // Reference sizes are unchanged for ordinary values; unusually long values fit instead of clipping.
  const fitted=width>maxWidth?size*maxWidth/width:size;
  if(fitted<7)throw new Error('Text zu lang für ein Kurz-Blatt.');
  page.drawText(value,{x:center?x-measure(fitted)/2:x,y,size:fitted,font,color:rgb(0,0,0)});
 };
 const {width:W,height:H}=SHORT_PAGE;let page!:PDFPage;
 for(let i=0;i<sheets.length;i++){
  const s=sheets[i],slot=i%2;if(slot===0)page=doc.addPage([W,H]);
  const top=H-20-slot*(H/2),y=top-135,L=W*.27,R=W*.73;
  await text(page,s.number,40,top-45,24,true,false,70);
  await text(page,s.plate,W/2,top-50,48,true,true,W-170);
  await text(page,s.arrivalDate,L,y,44,true,true,190);await text(page,s.returnDate,R,y,44,true,true,190);
  await text(page,s.arrivalTime?s.arrivalTime+' Uhr':'',L,y-32,24,true,true,190);
  await text(page,s.returnTime?s.returnTime+' Uhr':'',R,y-32,24,true,true,190);
  page.drawEllipse({x:R,y:y-1,xScale:95,yScale:49,borderColor:rgb(.85,0,0),borderWidth:3});
  page.drawLine({start:{x:W/2,y:y+40},end:{x:W/2,y:y-40},thickness:1,color:rgb(0,0,0)});
  let nameY=y-90;
  if(s.flight){await text(page,'Rückflug:',50,nameY,14);await text(page,s.flight,170,nameY,18,true,false,W-220);nameY-=40}
  await text(page,'Name:',50,nameY,14);await text(page,s.name,170,nameY,18,true,false,W-220);
  if(slot===0)page.drawLine({start:{x:20,y:H/2},end:{x:W-20,y:H/2},thickness:1,color:rgb(0,0,0),dashArray:[6,4]});
 }
 doc.setTitle('Travel Valet Parking – Kurz');doc.setAuthor(COMPANY.name);return doc;
}
export async function shortPdfFile(items:readonly {b:Booking}[],date:string):Promise<File>{
 // Existing bundled Unicode fonts are loaded only for characters outside Helvetica's WinAnsi set.
 const needsFallback=items.some(({b})=>Object.values(shortSheet(b)).some(v=>/[^\u0020-\u007e\u00a0-\u00ff]/.test(v)));
 let fallback:{regular:Uint8Array;bold:Uint8Array}|undefined;
 if(needsFallback){const {browserAssets}=await import('./print-sheets');fallback=await browserAssets()}
 const doc=await buildShortPdf(items,fallback),bytes=await doc.save();
 return new File([new Uint8Array(bytes).buffer],'tvp-kurz-'+date+'.pdf',{type:'application/pdf'});
}
