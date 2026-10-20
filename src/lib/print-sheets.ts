// Loaded only when printing. The approved vector PDF is copied, never recreated.
import {PDFDocument, type PDFFont, type PDFPage, rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import {COMPANY,sheetsFor,type SheetData} from './print-sheets-data';
import type {Booking} from '../model';
import {printableText} from './print-text';

export type SheetAssets={template:Uint8Array;regular:Uint8Array;bold:Uint8Array};
type QrFn=(text:string)=>Promise<string>;
export const defaultQr:QrFn=text=>QRCode.toDataURL(text,{margin:4,width:300,errorCorrectionLevel:'M'});
// Coordinates are the original designer's 1060 x 1484 artboard, not approximated mm.
const SX=595.2755905511812/1060,SY=841.8897637795277/1484;
const INK=rgb(20/255,38/255,53/255);
export type TextBox={x:number;y:number;w:number;h:number;size:number;bold?:boolean};
export const FIELD_BOXES={
 code:{x:428,y:190,w:145,h:22,size:16,bold:true},
 days:{x:622,y:190,w:90,h:22,size:16,bold:true},
 name:{x:157,y:275,w:347,h:21,size:15,bold:true},
 email:{x:157,y:301,w:347,h:21,size:15,bold:true},
 phone:{x:157,y:327,w:347,h:21,size:15,bold:true},
 source:{x:157,y:353,w:347,h:21,size:15,bold:true},
 brand:{x:666,y:275,w:357,h:21,size:15,bold:true},
 model:{x:666,y:301,w:357,h:21,size:15,bold:true},
 plate:{x:666,y:327,w:357,h:21,size:15,bold:true},
 color:{x:666,y:353,w:357,h:21,size:15,bold:true},
 dropoff:{x:147,y:437,w:363,h:21,size:15,bold:true},
 dropoffFlight:{x:147,y:459,w:363,h:21,size:15,bold:true},
 pickup:{x:664,y:437,w:363,h:21,size:15,bold:true},
 pickupFlight:{x:664,y:459,w:363,h:21,size:15,bold:true},
 remarks:{x:700,y:537,w:316,h:174,size:14},
 net:{x:869,y:881,w:137,h:22,size:16,bold:true},
 subtotal:{x:869,y:939,w:137,h:22,size:16,bold:true},
 vat:{x:869,y:968,w:137,h:22,size:16,bold:true},
 total:{x:869,y:1007,w:137,h:26,size:20,bold:true},
} satisfies Record<string,TextBox>;

function wrap(text:string,font:PDFFont,size:number,width:number):string[]{
 const lines:string[]=[];const widths=new Map<string,number>();
 const charWidth=(char:string)=>{if(!widths.has(char))widths.set(char,font.widthOfTextAtSize(char,size));return widths.get(char)!};
 for(const paragraph of text.replace(/\r/g,'').split('\n')){
  if(!paragraph){lines.push('');continue}
  let current='',used=0;
  for(const token of paragraph.split(/(\s+)/)){
   const tokenWidth=Array.from(token).reduce((sum,c)=>sum+charWidth(c),0);
   if(current&&used+tokenWidth>width){lines.push(current.trimEnd());current='';used=0}
   if(!current&&!token.trim())continue;
   for(const char of Array.from(token)){
    const w=charWidth(char);
    if(current&&used+w>width){lines.push(current.trimEnd());current='';used=0}
    current+=char;used+=w;
   }
  }
  lines.push(current);
 }
 return lines;
}
/** Fits the entire value, never truncates a name or note. Extreme data fails visibly rather than clipping. */
export function fitText(text:string,font:PDFFont,box:TextBox):{lines:string[];size:number}{
 if(text.length>6000)throw new Error('Text zu lang für ein A4-Blatt. Bitte Bemerkungen oder Stammdaten kürzen.');
 for(let size=box.size;size>=7;size-=.25){
  const lines=wrap(text,font,size*SX,box.w*SX);
  if(lines.length*size*1.15<=box.h)return{lines,size};
 }
 throw new Error('Text zu lang für ein A4-Blatt. Bitte Bemerkungen oder Stammdaten kürzen.');
}
function put(page:PDFPage,text:string,box:TextBox,font:PDFFont){
 text=printableText(text,font);
 if(!text)return;
 const fit=fitText(text,font,box);
 fit.lines.forEach((line,i)=>{if(line)page.drawText(line,{x:box.x*SX,y:page.getHeight()-(box.y+fit.size*.8+i*fit.size*1.15)*SY,size:fit.size*SX,font,color:INK})});
}
const amount=(v:string)=>v.replace(/\s*€$/,'');
export async function buildSheetsPdf(sheets:SheetData[],assets:SheetAssets,qr:QrFn=defaultQr):Promise<PDFDocument>{
 if(!sheets.length)throw new Error('Keine Buchungen für diesen Tag.');
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const template=await PDFDocument.load(assets.template);
 if(template.getPageCount()!==1)throw new Error('Die Druckvorlage muss genau eine Seite enthalten.');
 const regular=await doc.embedFont(assets.regular,{subset:true}),bold=await doc.embedFont(assets.bold,{subset:true});
 for(const s of sheets){
  const [page]=await doc.copyPages(template,[0]);doc.addPage(page);
  for(const [key,box] of Object.entries(FIELD_BOXES)){
   const value=s[key as keyof SheetData]||'';
   put(page,['net','subtotal','vat','total'].includes(key)?amount(value):value,box,('bold' in box&&box.bold)?bold:regular);
  }
  // The original template has no paid/balance lines. Use its unused gap above the handover card,
  // without masking, moving or replacing any of the approved artwork or payment checkboxes.
  if(s.paid||s.due)put(page,'Bezahlt: '+s.paid+'   |   Zu zahlen: '+s.due,{x:546,y:1089,w:480,h:13,size:11},regular);
  if(s.code){const image=await doc.embedPng(await qr(s.code));page.drawImage(image,{x:970*SX,y:page.getHeight()-214*SY,width:60*SX,height:60*SY})}
 }
 doc.setTitle('Travel Valet Parking – Buchungsblätter');doc.setAuthor(COMPANY.name);
 return doc;
}
let cache:Promise<SheetAssets>|undefined;
export function browserAssets(base=import.meta.env.BASE_URL):Promise<SheetAssets>{
 const get=async(path:string)=>{const r=await fetch(base+'print/'+path);if(!r.ok)throw new Error('Druckvorlage konnte nicht geladen werden');return new Uint8Array(await r.arrayBuffer())};
 cache??=Promise.all([get('booking-template.pdf'),get('LiberationSans-Regular.ttf'),get('LiberationSans-Bold.ttf')]).then(([template,regular,bold])=>({template,regular,bold}));
 cache.catch(()=>{cache=undefined});return cache;
}
export async function sheetsPdfFile(items:readonly {b:Booking}[],date:string):Promise<File>{
 const doc=await buildSheetsPdf(sheetsFor(items),await browserAssets());
 const bytes=await doc.save();
 return new File([new Uint8Array(bytes).buffer],'tvp-'+date+'.pdf',{type:'application/pdf'});
}
