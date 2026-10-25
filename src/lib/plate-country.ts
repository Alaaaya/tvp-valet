/** Display-only guess of a plate's country from its text. Never persisted. Ambiguous or unknown plates return null. */
export type PlateCountry='DE'|'NL'|null;
// Dutch consonant set used since sidecode 4 (no vowels, no C/Q/M/W/Y as normal passenger letters)
const C='BDFGHJKLNPRSTVXZ';
const nl=[
 new RegExp('^[A-Z]{2}\\d{4}$'),new RegExp('^\\d{4}[A-Z]{2}$'),new RegExp('^\\d{2}[A-Z]{2}\\d{2}$'),new RegExp('^[A-Z]{2}\\d{2}[A-Z]{2}$'),
 new RegExp('^['+C+']{2}['+C+']{2}\\d{2}$'),new RegExp('^\\d{2}['+C+']{4}$'),new RegExp('^\\d{2}['+C+']{3}\\d$'),new RegExp('^\\d['+C+']{3}\\d{2}$'),
 new RegExp('^['+C+']{2}\\d{3}['+C+']$'),new RegExp('^['+C+']\\d{3}['+C+']{2}$'),new RegExp('^['+C+']{3}\\d{2}['+C+']$')
];
const de=/^[A-ZÄÖÜ]{1,3}[- ][A-Z]{1,2}[- ]?\d{1,4}[EH]?$/;
export function plateCountry(raw:string|null|undefined):PlateCountry{
 const p=(raw||'').trim().toUpperCase().replace(/\s+/g,' ');
 if(!p||p==='AA-TEST-BB')return null;
 const isDe=de.test(p);
 const compact=p.replace(/[-\s]/g,'');
 const groups=p.split(/[- ]/).map(g=>g.length).join(',');
 const grouped=!/[- ]/.test(p)||['2,2,2','2,3,1','1,3,2','3,2,1'].includes(groups);
 const isNl=grouped&&nl.some(r=>r.test(compact));
 if(isDe&&isNl)return null;
 return isDe?'DE':isNl?'NL':null;
}
export function plateKind(raw:string|null|undefined):'DE'|'NL'|'unknown'|undefined{
 if(!raw||!raw.trim()||raw.trim()==='–')return undefined;
 return plateCountry(raw)||'unknown';
}
