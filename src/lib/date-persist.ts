const RE=/^\d{4}-\d{2}-\d{2}$/;
export const validDay=(s:unknown):s is string=>typeof s==='string'&&RE.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
export const dateKey=(scope:'main'|'new',userId:string)=>'tvp.'+scope+'-date.v1.'+encodeURIComponent(userId);
type R=Pick<Storage,'getItem'>;type W=Pick<Storage,'setItem'>;
export function readDate(s:R|null,scope:'main'|'new',userId:string,fallback:string):string{if(!s||!userId)return fallback;try{const v=s.getItem(dateKey(scope,userId));return validDay(v)?v:fallback}catch{return fallback}}
export function writeDate(s:W|null,scope:'main'|'new',userId:string,v:string){if(!s||!userId||!validDay(v))return;try{s.setItem(dateKey(scope,userId),v)}catch{}}
