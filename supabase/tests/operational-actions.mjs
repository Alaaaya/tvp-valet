/** Isolated PostgreSQL semantics/RLS test. Does not connect to live data. */
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.TVP_PGLITE_MODULE || '/tmp/tvp-dbtest/node_modules/@electric-sql/pglite/dist/index.js');
const db=new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security; grant usage on schema storage to anon,authenticated,service_role;
 grant all on storage.objects to anon,authenticated,service_role;`);
await db.exec(await readFile(new URL('../migrations/20261017090000_valet_backend.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../migrations/20261017100000_booking_operational_actions.sql',import.meta.url),'utf8'));
const admin='00000000-0000-4000-8000-000000000001',driver='00000000-0000-4000-8000-000000000002';
await db.query('insert into auth.users(id) values($1),($2)',[admin,driver]);
await db.query("insert into public.profiles(id,full_name,role) values($1,'Test Admin','admin'),($2,'Test Driver','driver')",[admin,driver]);
const booking=(await db.query("insert into public.bookings(customer_name,arrival_at,departure_at) values('Isolated test','2026-10-17T07:00:00Z','2026-10-20T07:00:00Z') returning *")).rows[0];
async function user(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);}
let checks=0;
async function patch(value){return db.query('select * from public.update_booking_ops($1,$2::jsonb)',[booking.id,JSON.stringify(value)]);}
async function fail(value,code){checks++;await assert.rejects(patch(value),e=>{assert.equal(e.code,code);return true;});}
await user(driver);
await fail({total:0},'22023');await fail({checked_in_at:null},'22023');
await fail({taken_away_at:true},'22023');await fail({taken_away_at:'2026-10-17T08:00:00'},'22023');
await fail({taken_away_at:'2026-10-17T08:00:00Z'},'23514');
const checkin=(await db.query("select * from public.check_booking($1,'in')",[booking.id])).rows[0].checked_in_at;
await fail({taken_away_at:'2026-10-17T00:00:00Z'},'23514');
const called=new Date().toISOString();
const after=(await patch({taken_away_at:called,customer_called_at:called,ride_started_at:called})).rows[0];
for(const k of ['taken_away_at','customer_called_at','ride_started_at']) {assert.equal(new Date(after[k]).toISOString(),called);checks++;}
assert.ok(checkin);assert.equal(after.total,'0.00');checks++;
const direct=(await db.query('update public.bookings set total=999 where id=$1 returning *',[booking.id])).rows;
assert.equal(direct.length,0);checks++;
await db.query("select public.check_booking($1,'out')",[booking.id]);
await fail({ride_started_at:new Date(Date.now()+86400000).toISOString()},'23514');
await patch({taken_away_at:null,customer_called_at:null,ride_started_at:null});checks++;
await user('', 'anon');await fail({},'42501');
console.log(JSON.stringify({status:'passed',checks,isolated:true,liveBookingWrites:0}));
await db.close();
