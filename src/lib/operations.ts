import {db} from '../api';
export type BookingOperationAction='taken_away'|'customer_called'|'ride_started';
export interface BookingOperations {booking_id:string;taken_away_at:string|null;customer_called_at:string|null;ride_started_at:string|null;performed_by:string;updated_at:string}
export async function loadBookingOperations():Promise<BookingOperations[]> {
  if(!db) throw new Error('Backend nicht eingerichtet');
  const {data,error}=await db.from('booking_operations').select('*');
  if(error) throw error;
  return data as BookingOperations[];
}
export async function recordBookingOperation(bookingId:string,action:BookingOperationAction):Promise<BookingOperations> {
  if(!db) throw new Error('Backend nicht eingerichtet');
  const {data,error}=await db.rpc('record_booking_operation',{p_booking_id:bookingId,p_action:action});
  if(error) throw error;
  return data as BookingOperations;
}
