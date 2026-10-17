import {db} from '../api';
import {validateFlightRequest} from '../../supabase/functions/_shared/flights';
import type {FlightUpdatesResult} from '../../supabase/functions/_shared/flights';
export {normalizeFlightNumber} from '../../supabase/functions/_shared/flights';
export type {FlightUpdate, FlightUpdatesResult, FlightStatus} from '../../supabase/functions/_shared/flights';

/** Arrival flights at DUS, keyed by scheduled Europe/Berlin date. Never writes booking dates. */
export async function fetchFlightUpdates(flightNumbers:string[], date:string):Promise<FlightUpdatesResult> {
  const body = validateFlightRequest({flightNumbers,date});
  if (!db) throw new Error('Backend nicht eingerichtet');
  let auth=await db.auth.getSession();
  if(auth.error||!auth.data.session)throw new Error('Bitte erneut anmelden, um Live-Flugzeiten zu laden');
  const request=(token:string)=>db!.functions.invoke('dus-flights',{body,headers:{Authorization:'Bearer '+token}});
  let {data,error}=await request(auth.data.session.access_token);
  // One safe refresh/retry only. This is a read-only call, never an operation replay.
  if(error?.context instanceof Response&&error.context.status===401){
    const refreshed=await db.auth.refreshSession();
    if(refreshed.error||!refreshed.data.session)throw new Error('Sitzung abgelaufen. Bitte erneut anmelden.');
    ({data,error}=await request(refreshed.data.session.access_token));
  }
  if (error) {
    let message = 'Live-Flugzeiten konnten nicht geladen werden';
    if (error.context instanceof Response) {
      try { const detail = await error.context.clone().json(); if (typeof detail.error === 'string') message=detail.error; } catch { /* network/non-JSON error */ }
    }
    throw new Error(message);
  }
  if (!data || !Array.isArray(data.flights) || !Array.isArray(data.missing) || typeof data.updatedAt !== 'string')
    throw new Error('Ungültige Antwort der Live-Flugquelle');
  return data as FlightUpdatesResult;
}
