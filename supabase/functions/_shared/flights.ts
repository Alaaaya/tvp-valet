/** Official DUS public board adapter. No booking writes, secrets or browser dependencies. */
export const DUS_SOURCE = 'https://www.dus.com/en/flights/arrivals';
export const DUS_ENDPOINT = 'https://www.dus.com/api/sitecore/flightapi/SearchFlightsWithOutParams';
export type FlightStatus = 'scheduled' | 'delayed' | 'approaching' | 'landed' | 'cancelled' | 'diverted' | 'unknown';
export interface FlightUpdate {
  flightNumber: string;
  scheduled: string | null;
  estimated: string | null;
  actual: string | null;
  status: FlightStatus;
  statusText: string | null;
  delayMinutes: number | null;
  source: string;
  updatedAt: string;
}
export interface FlightUpdatesResult {
  flights: FlightUpdate[];
  missing: string[];
  source: string;
  updatedAt: string;
  cached: boolean;
}
export function normalizeFlightNumber(value: string): string {
  const compact = value.trim().toUpperCase().replace(/[\s-]/g, '');
  const m = /^([A-Z0-9]{2}|[A-Z]{3})(0*\d{1,4})([A-Z]?)$/.exec(compact);
  if (!m || !/[A-Z]/.test(m[1])) throw new Error('Ungültige Flugnummer');
  return `${m[1]}${Number(m[2])}${m[3]}`;
}
export function validateFlightRequest(value: unknown): {flightNumbers: string[]; date: string} {
  if (!value || typeof value !== 'object') throw new Error('Ungültige Anfrage');
  const {flightNumbers, date} = value as Record<string, unknown>;
  if (!Array.isArray(flightNumbers) || flightNumbers.length > 100 ||
      flightNumbers.some(n => typeof n !== 'string' || n.length > 20)) throw new Error('Maximal 100 Flugnummern');
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error('Ungültiges Datum');
  return {flightNumbers: [...new Set(flightNumbers.map(normalizeFlightNumber))], date};
}
/** Berlin midnight is never ambiguous, including the March/October DST transitions. */
export function berlinMidnight(date: string): string {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  let utc = midnight;
  for (let i = 0; i < 3; i++) {
    const text = new Intl.DateTimeFormat('en-US', {timeZone:'Europe/Berlin', timeZoneName:'longOffset'})
      .formatToParts(new Date(utc)).find(p => p.type === 'timeZoneName')!.value;
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(text);
    if (!m) throw new Error('Zeitzone nicht verfügbar');
    const offset = (Number(m[2])*60+Number(m[3]))*(m[1] === '+' ? 1 : -1);
    utc = midnight - offset*60000;
  }
  return new Date(utc).toISOString();
}
export function makeDusUrl(date: string, offset = 0): string {
  const next = new Date(Date.parse(`${date}T00:00:00Z`)+86400000).toISOString().slice(0,10);
  const url = new URL(DUS_ENDPOINT);
  url.search = new URLSearchParams({lang:'en', arrival:'true', count:'500', offset:String(offset),
    codeshare:'true', showDetails:'false', flightStartTime:berlinMidnight(date),
    flightEndTime:new Date(Date.parse(berlinMidnight(next))-1000).toISOString()}).toString();
  return url.toString();
}
interface DusFlight {
  flightNumber?: unknown; adFlag?: unknown; scheduledTime?: unknown; estimatedTime?: unknown; actualTime?: unknown;
  status?: {code?: string; description?: string; publicStatus?: {name?: string} | null} | null;
}
const iso = (value: unknown): string | null => typeof value === 'string' &&
  /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export function mapDusFlight(raw: DusFlight, updatedAt: string): FlightUpdate | null {
  if (raw.adFlag !== 'A' || typeof raw.flightNumber !== 'string') return null;
  let flightNumber: string;
  try { flightNumber = normalizeFlightNumber(raw.flightNumber); } catch {return null;}
  const scheduled = iso(raw.scheduledTime), estimated = iso(raw.estimatedTime), actual = iso(raw.actualTime);
  if (!scheduled) return null;
  const delayMinutes = actual || estimated ? Math.round((Date.parse((actual || estimated)!)-Date.parse(scheduled))/60000) : null;
  const publicText = raw.status?.publicStatus?.name || null;
  const text = (publicText || raw.status?.description || '').toLowerCase();
  const code = raw.status?.code;
  let status: FlightStatus = 'unknown';
  if (/cancel/.test(text) || code === 'C') status = 'cancelled';
  else if (/divert/.test(text)) status = 'diverted';
  else if (actual || /landed|onblock|deboarding/.test(text)) status = 'landed';
  else if (/approach/.test(text) || code === 'A' || code === '+') status = 'approaching';
  else if (delayMinutes !== null && delayMinutes > 0) status = 'delayed';
  else if (!raw.status || /scheduled/.test(text)) status = 'scheduled';
  return {flightNumber, scheduled, estimated, actual, status, statusText:publicText,
    delayMinutes, source:DUS_SOURCE, updatedAt};
}
export async function readDusDay(date: string, fetcher: typeof fetch = fetch): Promise<FlightUpdate[]> {
  const flights: FlightUpdate[] = [];
  const updatedAt = new Date().toISOString();
  for (let page = 0; page < 8; page++) {
    const response = await fetcher(makeDusUrl(date, page*500), {headers:{
      'X-Requested-With':'XMLHttpRequest', Accept:'application/json', Referer:DUS_SOURCE,
    }, signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error(`DUS antwortet mit HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.hasError || !Array.isArray(payload.data?.flights) || typeof payload.data.more !== 'boolean')
      throw new Error('DUS-Datenformat nicht verfügbar');
    for (const raw of payload.data.flights) {
      const mapped = mapDusFlight(raw, updatedAt);
      // API filtering is checked again to avoid confusing recurrent numbers across days.
      if (mapped && new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date(mapped.scheduled!)) === date)
        flights.push(mapped);
    }
    if (!payload.data.more) return flights;
    if (payload.data.flights.length !== 500) throw new Error('Unvollständige DUS-Flugliste');
  }
  throw new Error('DUS-Paginierung überschreitet Sicherheitslimit');
}
export function selectFlights(all: FlightUpdate[], numbers: string[], updatedAt: string, cached: boolean): FlightUpdatesResult {
  const flights = all.filter(f => numbers.includes(f.flightNumber));
  return {flights, missing:numbers.filter(n => !flights.some(f => f.flightNumber === n)), source:DUS_SOURCE, updatedAt, cached};
}
