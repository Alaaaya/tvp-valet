import {db} from '../api';
export type BookingOperationAction='taken_away'|'customer_called'|'ride_started';
// performed_by is the latest newly recorded action actor, not every action actor.
// Repeated actions never change it. Per-action attribution lives in BookingOperationEvent.
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

export interface BookingOperationEvent {id:number;booking_id:string;action:BookingOperationAction;occurred_at:string;actor_id:string}
/** Immutable per-action attribution, ordered chronologically. */
export async function loadBookingOperationEvents(bookingId:string):Promise<BookingOperationEvent[]> {
  if(!db) throw new Error('Backend nicht eingerichtet');
  const {data,error}=await db.from('booking_operation_events').select('*').eq('booking_id',bookingId).order('occurred_at');
  if(error) throw error;
  return data as BookingOperationEvent[];
}
