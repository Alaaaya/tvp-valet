import {db} from '../api';
import type {Booking} from '../model';
type Action='in'|'out';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function canUndoHandover(booking:Booking,action:Action):boolean{
 return booking.status==='confirmed'&&(action==='out'?!!booking.checked_out_at:!!booking.checked_in_at&&!booking.checked_out_at);
}
export async function undoHandover({requestId,booking,action}:{requestId:string;booking:Booking;action:Action}):Promise<Booking>{
 if(!uuid.test(requestId)||!uuid.test(booking.id)||!['in','out'].includes(action))throw Error('Ungültige Rücknahme.');
 if(!canUndoHandover(booking,action))throw Error(action==='in'&&booking.checked_out_at?'Bitte zuerst den Check-out rückgängig machen.':'Diese Übergabe kann nicht rückgängig gemacht werden.');
 if(!db)throw Error('Backend nicht eingerichtet.');
 const {data,error}=await db.rpc('undo_booking_handover',{
  p_request_id:requestId,p_booking_id:booking.id,p_action:action,
  p_expected_at:action==='in'?booking.checked_in_at:booking.checked_out_at
 });
 if(error)throw Error(['PT409','40001'].includes(error.code)?'Die Buchung wurde inzwischen geändert. Bitte schließen, neu laden und erneut prüfen.':error.message);
 if(!data)throw Error('Keine Bestätigung erhalten. Bitte mit derselben Rücknahme erneut versuchen.');
 const revision=await db.from('bookings').select('*,booking_handover_undos(count)').eq('id',booking.id).single();
 if(revision.error)throw revision.error;
 if(!revision.data)throw Error('Buchung nach Rücknahme bitte neu laden.');
 const {booking_handover_undos,...current}=revision.data;
 const row={...current,lifecycle_revision:booking_handover_undos?.[0]?.count??0} as Booking;
 return{...row,...Object.fromEntries(['external_id','phone','email','plate','product','flight_in','flight_out','key_cash','spot','comment'].map(k=>[k,row[k as keyof Booking]??'']))};
}
