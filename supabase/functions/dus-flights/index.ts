import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { readDusDay, selectFlights, validateFlightRequest } from '../_shared/flights.ts';
import type {FlightUpdate} from '../_shared/flights.ts';

const allowedOrigins = new Set(['https://alaaaya.github.io', 'http://localhost:5173']);
const days = new Map<string, {flights:FlightUpdate[]; fetchedAt:number; updatedAt:string}>();
const pending = new Map<string, Promise<{flights:FlightUpdate[]; fetchedAt:number; updatedAt:string}>>();
const rates = new Map<string, {count:number; since:number}>();
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
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return reply({error:'Anmeldung erforderlich'},401);
    const db = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{
      global:{headers:{Authorization:authorization}}, auth:{persistSession:false,autoRefreshToken:false},
    });
    // Validate JWT server-side. The gateway is disabled for publishable-key compatibility.
    const {data:{user},error:authError} = await db.auth.getUser(authorization.slice(7));
    if (authError || !user) return reply({error:'Anmeldung erforderlich'},401);
    const {data:profile,error:profileError} = await db.from('profiles').select('active').eq('id',user.id).single();
    if (profileError || !profile?.active) return reply({error:'Kein aktiver Mitarbeiter'},403);
    const now = Date.now();
    // Best-effort per-isolate limit, not a replacement for gateway/global rate limiting.
    for (const [key,value] of rates) if (now-value.since > 60000) rates.delete(key);
    const rate = rates.get(user.id) || {count:0,since:now};
    if (++rate.count > 30) return reply({error:'Zu viele Anfragen. Bitte später erneut versuchen.'},429);
    rates.set(user.id,rate);
    const raw = await request.text();
    if (raw.length > 8192) return reply({error:'Anfrage zu groß'},413);
    let input:ReturnType<typeof validateFlightRequest>;
    try {input = validateFlightRequest(JSON.parse(raw));} catch(error) {
      return reply({error:error instanceof Error ? error.message : 'Ungültige Anfrage'},400);
    }
    const {date,flightNumbers} = input;
    // Public board is near-term data, not a historical archive or flight timetable service.
    const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date());
    if (Math.abs(Date.parse(date)-Date.parse(today)) > 7*86400000)
      return reply({error:'DUS-Liveflüge nur innerhalb von 7 Tagen verfügbar'},422);
    if (!flightNumbers.length) return reply(selectFlights([],[],new Date().toISOString(),false));
    const previous = days.get(date);
    let day = previous;
    const cached = !!day && now-day.fetchedAt < CACHE_MS;
    if (!cached) {
      let job = pending.get(date);
      if (!job) {
        job = readDusDay(date).then(flights => {
          const result = {flights,fetchedAt:Date.now(),updatedAt:new Date().toISOString()};
          if (days.size >= 16) days.delete(days.keys().next().value!);
          days.set(date,result);
          return result;
        }).finally(() => pending.delete(date));
        pending.set(date,job);
      }
      day = await job;
    }
    return reply(selectFlights(day!.flights,flightNumbers,day!.updatedAt,cached));
  } catch {
    // Never expose upstream bodies, JWTs, project keys, or infrastructure error details.
    return reply({error:'DUS-Livequelle momentan nicht erreichbar. Keine aktuellen Flugzeiten verfügbar.'},502);
  }
});
