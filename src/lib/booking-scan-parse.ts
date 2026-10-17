/** Pure helpers for the booking scanner. Nothing here navigates, evals or touches the network. */
export const MAX_CODE_LEN=40;
const CODE_RE=/^[A-Za-z0-9][A-Za-z0-9-]{2,39}$/;
const PARAM_KEYS=['code','booking','bookingcode','booking_code','b','id'];

export type QrParse={ok:true;code:string;source:'plain'|'url-param'|'url-path'}|{ok:false;reason:string};

/** letters/digits/hyphen only, 3..40 chars, must contain a digit or letter (never URL/markup chars) */
export function isValidBookingCode(s:string):boolean{return CODE_RE.test(s)}

/** Extract a booking code from raw QR text. Only a plain code, or a code in a known URL param / last path segment. */
export function parseQrPayload(raw:string,opts:{expectedHosts?:string[]}={}):QrParse{
  if(typeof raw!=='string')return{ok:false,reason:'Kein Text im QR-Code.'};
  const t=raw.trim().replace(/^#/,'');
  if(!t)return{ok:false,reason:'Der QR-Code ist leer.'};
  if(t.length>2048)return{ok:false,reason:'Der QR-Code ist zu lang.'};
  if(isValidBookingCode(t))return{ok:true,code:t.toUpperCase(),source:'plain'};
  if(/[\u0000-\u001f\s]/.test(t)&&!/^https?:\/\//i.test(t))return{ok:false,reason:'QR-Inhalt ist kein Buchungscode: '+preview(t)};
  let u:URL;
  try{u=new URL(t)}catch{return{ok:false,reason:'QR-Inhalt ist kein Buchungscode: '+preview(t)}}
  if(u.protocol!=='https:'&&u.protocol!=='http:')return{ok:false,reason:'QR-Inhalt ist kein Buchungscode: '+preview(t)};
  if(opts.expectedHosts&&!opts.expectedHosts.map(h=>h.toLowerCase()).includes(u.hostname.toLowerCase()))return{ok:false,reason:'Unbekannter Link ('+u.hostname+'). Nur Buchungscodes werden übernommen.'};
  for(const k of PARAM_KEYS){
    for(const [name,v] of u.searchParams)if(name.toLowerCase()===k){const c=v.trim().replace(/^#/,'');if(isValidBookingCode(c))return{ok:true,code:c.toUpperCase(),source:'url-param'}}
  }
  const seg=u.pathname.split('/').filter(Boolean).pop();
  if(seg){let d=seg;try{d=decodeURIComponent(seg)}catch{/* keep raw */}d=d.replace(/^#/,'');if(isValidBookingCode(d)&&/\d/.test(d))return{ok:true,code:d.toUpperCase(),source:'url-path'}}
  return{ok:false,reason:'Link ohne erkennbaren Buchungscode: '+preview(t)};
}
function preview(s:string){const x=s.replace(/[\u0000-\u001f]+/g,' ');return '"'+(x.length>60?x.slice(0,57)+'…':x)+'"'}

/** Lookup key: uppercase, no spaces/hyphens/dots/underscores. Display value is never altered by this. */
export function normalizePlate(s:string):string{
  return (s||'').normalize('NFKC').toUpperCase().replace(/[\s\-._·•|]+/g,'').replace(/[^A-Z0-9ÄÖÜ]/g,'');
}
export function platesMatch(a:string,b:string):boolean{const x=normalizePlate(a),y=normalizePlate(b);return x.length>=2&&x===y}

export interface PlateCandidate{display:string;key:string;score:number}
const GERMAN=/^([A-ZÄÖÜ]{1,3})[\s-]*([A-Z]{1,2})[\s-]*([1-9]\d{0,3})(\s?[EH])?$/;
/** Conservative candidate extraction from noisy OCR text. Never silently substitutes characters (no O/0 guessing). */
export function extractPlateCandidates(ocr:string):PlateCandidate[]{
  const out=new Map<string,PlateCandidate>();
  const lines=(ocr||'').toUpperCase().split(/\r?\n/).map(l=>l.replace(/[^A-Z0-9ÄÖÜ\s-]/g,' ').replace(/\s+/g,' ').trim()).filter(Boolean);
  const add=(display:string,score:number)=>{const key=normalizePlate(display);if(key.length<4||key.length>10||!/\d/.test(key)||!/[A-ZÄÖÜ]/.test(key))return;const o=out.get(key);if(!o||o.score<score)out.set(key,{display,key,score})};
  for(const l of lines){
    if(GERMAN.test(l))add(l,3);
    const toks=l.split(' ');
    for(let i=0;i<toks.length;i++)for(let n=1;n<=3&&i+n<=toks.length;n++){
      const g=toks.slice(i,i+n).join(' ');
      if(GERMAN.test(g))add(g,n>1?3:2);
      else if(n===1&&/^[A-Z0-9ÄÖÜ-]{5,9}$/.test(g))add(g,1);
    }
  }
  return [...out.values()].sort((a,b)=>b.score-a.score||b.key.length-a.key.length);
}
