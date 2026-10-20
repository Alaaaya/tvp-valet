// Lazily imported on click: keeps jsPDF + qrcode out of the main bundle.
import {jsPDF} from 'jspdf';
import QRCode from 'qrcode';
import {COMPANY,sheetsFor,type SheetData} from './print-sheets-data';
import type {Booking} from '../model';

export type SheetAssets={logo:string;cars:string};
type QrFn=(text:string)=>Promise<string>;

const L=14,R=196,MID=105;
const GREEN:[number,number,number]=[76,175,80],RED:[number,number,number]=[220,80,80];

function fit(doc:jsPDF,text:string,width:number):string{
 if(!text||doc.getTextWidth(text)<=width)return text;
 let t=text;while(t.length>1&&doc.getTextWidth(t+'…')>width)t=t.slice(0,-1);
 return t+'…';
}
function rule(doc:jsPDF,y:number,x1=L-2,x2=R+2,w=0.5){doc.setLineWidth(w);doc.setDrawColor(0);doc.line(x1,y,x2,y)}
function field(doc:jsPDF,label:string,value:string,x:number,y:number,valueX:number,lineEnd:number){
 doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(label,x,y);
 if(value)doc.text(fit(doc,value,lineEnd-valueX-1),valueX+1,y);
 doc.setLineWidth(0.15);doc.line(valueX,y+1.2,lineEnd,y+1.2);
}
function bold(doc:jsPDF,text:string,x:number,y:number,size=10,align:'left'|'right'|'center'='left'){doc.setFont('helvetica','bold');doc.setFontSize(size);doc.text(text,x,y,{align})}
function normal(doc:jsPDF,text:string|string[],x:number,y:number,size=9,align:'left'|'right'|'center'='left'){doc.setFont('helvetica','normal');doc.setFontSize(size);doc.text(text,x,y,{align})}
function box(doc:jsPDF,x:number,y:number){doc.setLineWidth(0.2);doc.rect(x,y-2.6,2.8,2.8)}

async function drawSheet(doc:jsPDF,s:SheetData,assets:SheetAssets,qr:QrFn){
 // Header
 doc.addImage(assets.logo,'PNG',L,9,22,22,'tvp-logo','FAST');
 normal(doc,'Bitte ausdrucken und mitnehmen.',L,36);
 normal(doc,'Bei Fragen bitte folgende Nummer anrufen: '+COMPANY.phone+'.',L,40.5);
 if(s.code)doc.addImage(await qr(s.code),'PNG',117,10,27,27,undefined,'FAST');
 const tx=149;
 doc.setFont('helvetica','bold');doc.setFontSize(9.5);
 const title=doc.splitTextToSize(s.title,R-tx) as string[];
 doc.text(title.slice(0,2),tx,14);
 const ty=14+Math.min(2,title.length)*4.2;
 normal(doc,'Bestellnummer:',tx,ty+1);doc.text(fit(doc,s.code,22),R,ty+1,{align:'right'});
 normal(doc,'# Tage / # Pers.:',tx,ty+5.5);doc.text(s.daysPersons,R,ty+5.5,{align:'right'});
 rule(doc,45);

 // Customer / vehicle
 bold(doc,'Kunde',L,51);bold(doc,'Fahrzeug',110,51);
 const rows:[string,string,string,string][]= [['Name:',s.name,'Marke:',s.brand],['E-Mail:',s.email,'Model:',s.model],['Handy:',s.phone,'Nummernschild:',s.plate],['Quelle:',s.source,'Farbe:',s.color]];
 rows.forEach(([a,av,b,bv],i)=>{const y=56.5+i*5.6;field(doc,a,av,L,y,29,101);field(doc,b,bv,110,y,135,R)});
 rule(doc,79);

 // Drop-off / pick-up
 doc.setLineWidth(0.5);doc.setDrawColor(...GREEN);doc.rect(L,82,88,13);doc.setDrawColor(...RED);doc.rect(108,82,88,13);doc.setDrawColor(0);
 bold(doc,'ABGABEDATUM',L+2.5,87.2,9.5);normal(doc,s.dropoff,L+31,87.2,9.5);
 bold(doc,'FLUGNR',L+2.5,92.4,9.5);normal(doc,fit(doc,s.dropoffFlight,52),L+31,92.4,9.5);
 bold(doc,'ABHOLDATUM',110.5,87.2,9.5);normal(doc,s.pickup,139,87.2,9.5);
 bold(doc,'FLUGNR',110.5,92.4,9.5);normal(doc,fit(doc,s.pickupFlight,52),139,92.4,9.5);
 rule(doc,98.5);

 // Damage diagram + remarks
 const cw=112,ch=cw*650/1340;
 doc.addImage(assets.cars,'PNG',L,101,cw,ch,'tvp-cars','FAST');
 normal(doc,'Bemerkungen:',140,104.5);
 doc.setLineWidth(0.25);doc.rect(140,106.5,R-140,49);
 if(s.remarks){
  doc.setFont('helvetica','normal');doc.setFontSize(8);
  const lines=(doc.splitTextToSize(s.remarks,R-140-4) as string[]);
  const max=14;const shown=lines.length>max?[...lines.slice(0,max-1),fit(doc,lines[max-1]+' …',R-144)]:lines;
  doc.text(shown,142,110.5,{lineHeightFactor:1.15});
 }
 normal(doc,'Status',L,161.5);
 const checks=[['Check erledigt','Schmutzig','Kratzer','Nass'],['Beulen','Dunkles Wetter','Felg(en) beschädigt']];
 checks.forEach((row,r)=>row.forEach((label,c)=>{const x=L+c*46,y=167+r*5.6;box(doc,x,y);normal(doc,label,x+4.2,y)}));
 rule(doc,175.5);

 // Left: instructions + transport legs
 doc.setLineWidth(0.4);doc.line(MID,175.5,MID,261);
 bold(doc,'Anleitung',L,181);
 bold(doc,'Valet-Treffpunkt (Fahrzeugabgabe und -rückgabe):',L,186,8.6);
 doc.setFont('helvetica','normal');doc.setFontSize(8.6);
 const addr=doc.splitTextToSize(COMPANY.meetingPoint,MID-L-4) as string[];doc.text(addr,L,190,{lineHeightFactor:1.2});
 const callY=190+addr.length*3.7+2;
 const call=doc.splitTextToSize('Bitte rufen Sie uns 30 Minuten vor Ihrer Ankunft am Flughafen Düsseldorf an unter: '+COMPANY.phone,MID-L-4) as string[];
 doc.text(call,L,callY,{lineHeightFactor:1.2});
 rule(doc,208,L,MID-4,0.4);
 bold(doc,'Transport Strecken',L,213);
 const legRows=['Datum / Zeit','Von','Nach','KM-Stand'];
 [[1,L,218],[3,59.5,218],[2,L,240.8],[4,59.5,240.8]].forEach(([n,x,y])=>{
  [`Fahrer (${n})`,...legRows].forEach((label,i)=>{const yy=y+i*4.3;normal(doc,label,x,yy,8.3);doc.setLineWidth(0.15);doc.line(x+20,yy+0.8,x+41,yy+0.8)});
 });

 // Right: payment + cost overview
 const rx=109;
 bold(doc,'Bezahlung',rx,181);
 [['Bezahlt',s.paid],['Zu zahlen',s.due],['Traf sich mit:','']].forEach(([l,v],i)=>{normal(doc,l,rx,185.5+i*4.4,8.6);if(v)doc.text(v,rx+22,185.5+i*4.4)});
 bold(doc,'Kostenübersicht',rx,202);
 const cost=(label:string,value:string,y:number,x=rx,strong=false)=>{doc.setFont('helvetica',strong?'bold':'normal');doc.setFontSize(8.6);doc.text(label,x,y);if(value)doc.text(value,R,y,{align:'right'})};
 cost('Parken',s.net,206.5);
 cost('Zwischensumme:',s.subtotal,211,150);
 cost('MwSt. (19 %):',s.vat,215.2,150);
 cost('Gesamt:',s.total,220,rx,true);
 cost('Bezahlter Betrag:',s.paidAmount,224.3);
 cost('Barzahlung vor Ort:',s.cashOnSite,228.6);
 rule(doc,231.5,rx,R,0.4);
 ([['Geliefert',rx],['Akzeptiert von:',153]] as [string,number][]).forEach(([h,x])=>{
  bold(doc,h,x,236.5,9.5);
  normal(doc,'Datum:',x,241.5,8.3);doc.setLineWidth(0.15);doc.line(x+11,242.3,x+41,242.3);
  normal(doc,'Zeit:',x,246.5,8.3);doc.line(x+11,247.3,x+41,247.3);
  normal(doc,'Name des Mitarbeiters:',x,251.5,8.3);doc.line(x,257.3,x+41,257.3);
 });
 rule(doc,261);

 // Signatures
 normal(doc,'Mit Ihrer Unterschrift erklären Sie, dass Sie die Allgemeinen Geschäftsbedingungen gelesen und akzeptiert haben',105,265.5,8.4,'center');
 doc.setLineWidth(0.2);doc.line(20,278,92,278);doc.line(118,278,190,278);
 normal(doc,'UNTERSCHRIFT BEI ANKUNFT',56,282,9,'center');
 normal(doc,'UNTERSCHRIFT BEI DER ABREISE',154,282,9,'center');

 // Footer (own company only)
 rule(doc,286);
 normal(doc,[COMPANY.name,COMPANY.street,COMPANY.city,COMPANY.phone,COMPANY.email].join(' | '),105,290.5,7.4,'center');
}

export const defaultQr:QrFn=text=>QRCode.toDataURL(text,{margin:0,width:300,errorCorrectionLevel:'M'});

export async function buildSheetsPdf(sheets:SheetData[],assets:SheetAssets,qr:QrFn=defaultQr):Promise<jsPDF>{
 const doc=new jsPDF({unit:'mm',format:'a4',orientation:'portrait',compress:true});
 doc.setProperties({title:'Buchungsblätter',author:COMPANY.name,creator:COMPANY.name});
 for(let i=0;i<sheets.length;i++){if(i)doc.addPage('a4','portrait');await drawSheet(doc,sheets[i],assets,qr)}
 return doc;
}

async function asDataUrl(url:string):Promise<string>{
 const res=await fetch(url);if(!res.ok)throw new Error('Asset '+url+' '+res.status);
 const blob=await res.blob();
 return await new Promise((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>fail(r.error);r.readAsDataURL(blob)});
}
let assetCache:Promise<SheetAssets>|null=null;
export function browserAssets(base=import.meta.env.BASE_URL):Promise<SheetAssets>{
 assetCache??=Promise.all([asDataUrl(base+'print/logo.png'),asDataUrl(base+'print/cars@2x.png')]).then(([logo,cars])=>({logo,cars}));
 assetCache.catch(()=>{assetCache=null});
 return assetCache;
}
export async function sheetsPdfFile(items:readonly {b:Booking}[],date:string):Promise<File>{
 const doc=await buildSheetsPdf(sheetsFor(items),await browserAssets());
 return new File([doc.output('blob')],'tvp-'+date+'.pdf',{type:'application/pdf'});
}
