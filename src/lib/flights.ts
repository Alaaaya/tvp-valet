import {supabaseUrl,supabaseAnonKey} from '../api';
import {validateFlightRequest} from '../../supabase/functions/_shared/flights';
import type {FlightUpdatesResult} from '../../supabase/functions/_shared/flights';
export {normalizeFlightNumber} from '../../supabase/functions/_shared/flights';
export type {FlightUpdate, FlightUpdatesResult, FlightStatus} from '../../supabase/functions/_shared/flights';


/** Read-only flight lookup. Session persistence/refresh is enabled in the shared client. */
export async function fetchFlightUpdates(flightNumbers:string[], date:string, direction:'arrival'|'departure'='arrival'):Promise<FlightUpdatesResult> {
  const validated=validateFlightRequest({flightNumbers,date,...(direction==='departure'?{direction}:{})});
  // Validation supplies the default arrival direction.
  const body={...validated,...(direction==='departure'?{direction}:{})};
  if (!supabaseUrl||!supabaseAnonKey) throw new Error('Backend nicht eingerichtet');
  // Public read-only endpoint: anon key only, never the user's session token.
  let res:Response;
  try {
    res=await fetch(supabaseUrl+'/functions/v1/dus-flights',{method:'POST',headers:{apikey:supabaseAnonKey,Authorization:'Bearer '+supabaseAnonKey,'Content-Type':'application/json'},body:JSON.stringify(body)});
  } catch { throw new Error('Flugzeiten konnten nicht geladen werden'); }
  let data:any=null;
  try { data=await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new Error(typeof data?.error==='string'?data.error:'Flugzeiten konnten nicht geladen werden');
  if (!data || !Array.isArray(data.flights) || !Array.isArray(data.missing) || typeof data.updatedAt !== 'string')
    throw new Error('Ungültige Antwort der Live-Flugquelle');
  return data as FlightUpdatesResult;
}
