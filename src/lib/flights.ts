import {db} from '../api';
import {validateFlightRequest} from '../../supabase/functions/_shared/flights';
import type {FlightUpdatesResult} from '../../supabase/functions/_shared/flights';
export {normalizeFlightNumber} from '../../supabase/functions/_shared/flights';
export type {FlightUpdate, FlightUpdatesResult, FlightStatus} from '../../supabase/functions/_shared/flights';

let refreshing:Promise<string>|null=null;
/** One refresh for concurrent day/direction lookups, without rotating the refresh token twice. */
async function refreshToken(failedToken:string):Promise<string> {
  if(refreshing)return refreshing;
  refreshing=(async()=>{
    const current=await db!.auth.getSession();
    if(!current.error&&current.data.session&&current.data.session.access_token!==failedToken)
      return current.data.session.access_token;
    const result=await db!.auth.refreshSession();
    if(result.error||!result.data.session)throw new Error('Sitzung abgelaufen. Bitte erneut anmelden.');
    return result.data.session.access_token;
  })();
  try{return await refreshing}finally{refreshing=null}
}

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
  if(expiresAt&&expiresAt*1000<Date.now()+60000)token=await refreshToken(token);
  const request=(accessToken:string)=>db!.functions.invoke('dus-flights',{body,headers:{Authorization:'Bearer '+accessToken}});
  let {data,error}=await request(token);
  // Retry only reads, once, and only on an authentication rejection.
  if(error?.context instanceof Response&&error.context.status===401){
    token=await refreshToken(token);
    ({data,error}=await request(token));
  }
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
