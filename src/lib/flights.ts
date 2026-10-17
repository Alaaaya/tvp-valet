import {db} from '../api';
import {validateFlightRequest} from '../../supabase/functions/_shared/flights';
import type {FlightUpdatesResult} from '../../supabase/functions/_shared/flights';
export {normalizeFlightNumber} from '../../supabase/functions/_shared/flights';
export type {FlightUpdate, FlightUpdatesResult, FlightStatus} from '../../supabase/functions/_shared/flights';

import {refreshSessionSafely} from './auth-recovery';

/** Read-only flight lookup. Session persistence/refresh is enabled in the shared client. */
export async function fetchFlightUpdates(flightNumbers:string[], date:string, direction:'arrival'|'departure'='arrival'):Promise<FlightUpdatesResult> {
  const validated=validateFlightRequest({flightNumbers,date,...(direction==='departure'?{direction}:{})});
  // Validation supplies the default arrival direction.
  const body={...validated,...(direction==='departure'?{direction}:{})};
  if (!db) throw new Error('Backend nicht eingerichtet');
  const auth=await db.auth.getSession();
  if(auth.error||!auth.data.session)throw new Error('Bitte erneut anmelden, um Flugzeiten zu laden');
  let token=auth.data.session.access_token;
  const expiresAt=auth.data.session.expires_at;
  if(expiresAt&&expiresAt*1000<Date.now()+60000)token=await refreshSessionSafely(db.auth,token);
  const request=(accessToken:string)=>db!.functions.invoke('dus-flights',{body,headers:{Authorization:'Bearer '+accessToken}});
  let {data,error}=await request(token);
  // The shared client transport owns the single auth-rejection retry.
  if (error) {
    let message = 'Flugzeiten konnten nicht geladen werden';
    if (error.context instanceof Response) {
      try { const detail = await error.context.clone().json(); if (typeof detail.error === 'string') message=detail.error; } catch { /* network/non-JSON error */ }
    }
    throw new Error(message);
  }
  if (!data || !Array.isArray(data.flights) || !Array.isArray(data.missing) || typeof data.updatedAt !== 'string')
    throw new Error('Ungültige Antwort der Live-Flugquelle');
  return data as FlightUpdatesResult;
}
