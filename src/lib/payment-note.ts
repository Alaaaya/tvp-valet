import {displayComment} from './comments';
import type {Booking} from '../model';
const L='a-zäöüßA-ZÄÖÜ';
const AMT='\\d+(?:[.,]\\d+)?\\s*€';
const KW='(?:(?<![${L}])muss(?![${L}])|(?<![${L}])zahlen(?![${L}]))';
const RE=new RegExp(KW+'[\\s\\S]{0,40}?'+AMT+'|'+AMT+'[\\s\\S]{0,40}?'+KW,'i');
/** True when text tells staff the customer must still pay an amount (e.g. "Muss 10€ zahlen"). Display only. */
export function hasPaymentInstruction(text:string|null|undefined):boolean{return !!text&&RE.test(text)}
/** Plain-text instruction from the stored comment (human notes and imported vehicle description). Never HTML. */
export function paymentInstruction(b:Pick<Booking,'comment'>):string{
 const c=displayComment(b.comment||'',true);
 return [c.vehicle,c.text].map(s=>(s||'').trim()).filter(s=>s&&hasPaymentInstruction(s)).join('\n');
}
