import {db} from '../api';
import {validateFlightRequest} from '../../supabase/functions/_shared/flights';
import type {FlightUpdatesResult} from '../../supabase/functions/_shared/flights';
export {normalizeFlightNumber} from '../../supabase/functions/_shared/flights';
export type {FlightUpdate, FlightUpdatesResult, FlightStatus} from '../../supabase/functions/_shared/flights';

/** Arrival flights at DUS, keyed by scheduled Europe/Berlin date. Never writes booking dates. */
export async function fetchFlightUpdates(flightNumbers:string[], date:string):Promise<FlightUpdatesResult> {
  const body = validateFlightRequest({flightNumbers,date});
  if (!db) throw new Error('Backend nicht eingerichtet');
  const {data,error} = await db.functions.invoke('dus-flights',{body});
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
