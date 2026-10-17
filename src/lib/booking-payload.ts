import type {Booking} from '../model';
// Positive allowlist: select('*') and merged view records may carry server-only fields.
const bookingFields = ['id','code','external_id','platform','customer_name','phone','email','persons','plate','product','covered','arrival_at','departure_at','flight_in','flight_out','actual_flight_in','actual_flight_out','checked_in_at','checked_out_at','status','total','paid','key_cash','spot','km','comment','driver_id','created_at'] as const satisfies readonly (keyof Booking)[];
export function bookingWritePayload(booking:Booking):Record<string,unknown> {
 const payload:Record<string,unknown>={};
 for(const field of bookingFields)payload[field]=booking[field];
 payload.external_id=booking.external_id||null;
 payload.product=booking.product||null;
 return payload;
}
