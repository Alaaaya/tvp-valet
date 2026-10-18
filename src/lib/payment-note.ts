import {displayComment,omitExternalReference} from './comments';
import type {Booking} from '../model';
const NL='(?<![a-zäöüß])',NR='(?![a-zäöüß])';
const ZAHLEN=NL+'zahlen'+NR;
const MUSS_EUR=NL+'muss'+NR+'[\\s\\S]{0,40}?€';
const RE=new RegExp(ZAHLEN+'|'+MUSS_EUR,'iu');
/** True when text tells staff the customer must still pay an amount (e.g. "Muss 10€ zahlen" or any standalone "zahlen"). Display only. */
export function hasPaymentInstruction(text:string|null|undefined):boolean{return !!text&&RE.test(text)}
/** Plain-text instruction from the stored comment (human notes and imported vehicle description). Never HTML. */
export function paymentInstruction(b:Pick<Booking,'comment'> & Partial<Pick<Booking,'external_id'|'code'>>):string{
 const c=displayComment(b.comment||'',true);
 return [c.vehicle,c.text].map(s=>omitExternalReference((s||'').trim(),b.external_id,b.code)).filter(s=>s&&hasPaymentInstruction(s)).join('\n');
}
