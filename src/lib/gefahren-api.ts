import {db} from '../api';
import {t as tr} from './i18n';
export type Gefahren=1|2|3|4|null;
export function validGefahren(v:unknown):v is Gefahren{return v===null||(Number.isInteger(v)&&typeof v==='number'&&v>=1&&v<=4)}
/** Intentionally online-only: no offline outbox and no stale booking patch. */
export async function saveGefahren(id:string,value:Gefahren,uid:string):Promise<Gefahren>{
 if(!validGefahren(value))throw Error('Invalid Gefahren');
 if(!navigator.onLine)throw Error(tr('Gefahren nur online speichern.'));
 if(!db)throw Error(tr('Backend nicht eingerichtet'));
 const session=await db.auth.getSession();
 if(session.error)throw session.error;
 if(session.data.session?.user.id!==uid)throw Error(tr('Sitzung abgelaufen. Bitte erneut anmelden.'));
 const{data,error}=await db.rpc('set_booking_gefahren',{p_id:id,p_value:value});
 if(error)throw error;
 const after=await db.auth.getSession();
 if(after.error||after.data.session?.user.id!==uid)throw Error(tr('Sitzung abgelaufen. Bitte erneut anmelden.'));
 const row=Array.isArray(data)?data[0]:data;
 if(!row||row.id!==id||!validGefahren(row.gefahren)||row.gefahren!==value)throw Error(tr('Speichern fehlgeschlagen'));
 return row.gefahren;
}
