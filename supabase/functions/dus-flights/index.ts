import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { readDusDay, selectFlights, validateFlightRequest, validateFlightDateRange } from '../_shared/flights.ts';
import type {FlightUpdate} from '../_shared/flights.ts';

const allowedOrigins = new Set(['https://alaaaya.github.io', 'http://localhost:5173']);
const days = new Map<string, {flights:FlightUpdate[]; fetchedAt:number; updatedAt:string}>();
const pending = new Map<string, Promise<{flights:FlightUpdate[]; fetchedAt:number; updatedAt:string}>>();
const CACHE_MS = 60000;

Deno.serve(async request => {
  const origin = request.headers.get('origin');
  const headers: Record<string,string> = {'Content-Type':'application/json', 'Cache-Control':'no-store', Vary:'Origin'};
  if (origin && allowedOrigins.has(origin)) Object.assign(headers, {
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
  });
  const reply = (body:unknown, status=200) => new Response(JSON.stringify(body),{status,headers});
  if (origin && !allowedOrigins.has(origin)) return reply({error:'Origin nicht erlaubt'},403);
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
  if (request.method !== 'POST') return reply({error:'POST erforderlich'},405);
  if (Number(request.headers.get('content-length')) > 8192) return reply({error:'Anfrage zu groß'},413);
  try {
    // Public flight data only. Never inspect a user session or use service_role.
    const anon = Deno.env.get('TVP_FLIGHTS_PUBLIC_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!;
    if (request.headers.get('apikey') !== anon ||
        request.headers.get('authorization') !== 'Bearer ' + anon)
      return reply({error:'Öffentlicher API-Schlüssel erforderlich'},401);
    const budget = createClient(Deno.env.get('SUPABASE_URL')!, anon, {
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    });
    // Atomic Postgres budget shared across ALL Edge isolates/restarts. Fail closed.
    const {data:allowed,error:budgetError} = await budget.rpc('consume_dus_flight_budget');
    if (budgetError || typeof allowed !== 'boolean')
      return reply({error:'Flugabfrage momentan nicht verfügbar. Bitte später erneut versuchen.'},503);
    if (!allowed) {
      headers['Retry-After'] = '60';
      return reply({error:'Zu viele Anfragen. Bitte später erneut versuchen.'},429);
    }
    const now = Date.now();
    const raw = await request.text();
    if (raw.length > 8192) return reply({error:'Anfrage zu groß'},413);
    let input:ReturnType<typeof validateFlightRequest>;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
          Object.keys(parsed).some(key => !['date','flightNumbers','direction'].includes(key)))
        throw new Error('Ungültige Anfrage');
      input = validateFlightRequest(parsed);
    } catch(error) {
      return reply({error:error instanceof Error ? error.message : 'Ungültige Anfrage'},400);
    }
    const {date,flightNumbers,direction} = input;
    // DUS publishes date-valid schedules too. Empty future days are neutral, never errors or inferred recurrences.
    try { validateFlightDateRange(date); } catch (error) {
      return reply({error:(error as Error).message},422);
    }
    if (!flightNumbers.length) return reply(selectFlights([],[],new Date().toISOString(),false,direction,date));
    const cacheKey = `${direction}:${date}`;
    const previous = days.get(cacheKey);
    let day = previous;
    const cached = !!day && now-day.fetchedAt < CACHE_MS;
    if (!cached) {
      let job = pending.get(cacheKey);
      if (!job) {
        job = readDusDay(date,fetch,direction).then(flights => {
          const result = {flights,fetchedAt:Date.now(),updatedAt:new Date().toISOString()};
          if (days.size >= 16) days.delete(days.keys().next().value!);
          days.set(cacheKey,result);
          return result;
        }).finally(() => pending.delete(cacheKey));
        pending.set(cacheKey,job);
      }
      day = await job;
    }
    return reply(selectFlights(day!.flights,flightNumbers,day!.updatedAt,cached,direction,date));
  } catch {
    // Never expose upstream bodies, JWTs, project keys, or infrastructure error details.
    return reply({error:'DUS-Livequelle momentan nicht erreichbar. Keine aktuellen Flugzeiten verfügbar.'},502);
  }
});
