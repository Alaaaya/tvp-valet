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
await db.exec(await readFile(new URL('../migrations/20261017130000_retrieved_operation.sql',import.meta.url),'utf8'));
const admin='00000000-0000-4000-8000-000000000001',driver='00000000-0000-4000-8000-000000000002';
await db.query('insert into auth.users(id) values($1),($2)',[admin,driver]);
await db.query("insert into public.profiles(id,full_name,role) values($1,'Test Admin','admin'),($2,'Test Driver','driver')",[admin,driver]);
const booking=(await db.query("insert into public.bookings(customer_name,arrival_at,departure_at) values('Isolated test','2026-10-17T07:00:00Z','2026-10-20T07:00:00Z') returning *")).rows[0];
async function user(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);}
let checks=0;
async function action(value){return db.query('select * from public.record_booking_operation($1,$2)',[booking.id,value]);}
async function fail(value,code){checks++;await assert.rejects(action(value),e=>{assert.equal(e.code,code);return true;});}
await user(driver);
await fail('total','22023');await fail(null,'22023');await fail('taken_away','23514');await fail('ride_started','23514');await fail('retrieved','23514');
const baseline=(await db.query('select * from public.bookings where id=$1',[booking.id])).rows[0];
const called=(await action('customer_called')).rows[0];assert.ok(called.customer_called_at);checks++;
const retry=(await action('customer_called')).rows[0];assert.deepEqual(retry,called);checks++;
assert.deepEqual((await db.query('select * from public.bookings where id=$1',[booking.id])).rows[0],baseline);checks++;
await db.query("select public.check_booking($1,'in')",[booking.id]);
const afterCheck=(await db.query('select * from public.bookings where id=$1',[booking.id])).rows[0];
for(const name of ['taken_away','retrieved','ride_started']){const op=(await action(name)).rows[0];assert.ok(op[name+'_at']);checks++;}
assert.deepEqual((await db.query('select * from public.bookings where id=$1',[booking.id])).rows[0],afterCheck);checks++;
assert.equal((await db.query('select * from public.booking_operation_events')).rows.length,4);checks++;
for(const sql of ["update public.booking_operations set updated_at=now()","delete from public.booking_operation_events","insert into public.booking_operations(booking_id,performed_by) values($1,$2)"]){await assert.rejects(db.query(sql,sql.includes('$1')?[booking.id,driver]:[]),e=>e.code==='42501');checks++;}
// A different staff member cannot claim an existing action by retrying it.
await user(admin);
const actorRetry=(await action('customer_called')).rows[0];assert.equal(actorRetry.performed_by,driver);checks++;
const originalEvent=(await db.query("select * from public.booking_operation_events where action='customer_called'")).rows[0];assert.equal(originalEvent.actor_id,driver);checks++;
for(const sql of ["update public.booking_operations set performed_by=$1","update public.booking_operation_events set actor_id=$1","insert into public.booking_operation_events(booking_id,action,occurred_at,actor_id) values($1,'customer_called',now(),$2)"]){await assert.rejects(db.query(sql,sql.includes('$2')?[booking.id,admin]:[admin]),e=>e.code==='42501');checks++;}
await user(driver);
await db.query("select public.check_booking($1,'out')",[booking.id]);
await action('taken_away');checks++;
await action('retrieved');checks++;
await user('', 'anon');await fail('customer_called','42501');
await db.exec('reset role');
await db.query('update public.profiles set active=false where id=$1',[driver]);
await user(driver);await fail('customer_called','42501');
await db.exec('reset role');
await db.query('update public.profiles set active=true where id=$1',[driver]);
const closed=(await db.query("insert into public.bookings(customer_name,arrival_at,departure_at,status) values('Cancelled','2026-10-17T07:00:00Z','2026-10-20T07:00:00Z','cancelled') returning id")).rows[0];
await user(driver);await assert.rejects(db.query("select public.record_booking_operation($1,'customer_called')",[closed.id]),e=>e.code==='23514');checks++;
await assert.rejects(db.query("select public.record_booking_operation($1,'customer_called')",['00000000-0000-4000-8000-000000000099']),e=>e.code==='P0002');checks++;

await db.exec('reset role');
assert.ok((await db.query("select * from public.audit_log where entity='booking_operation_events'")).rows.length>=3);checks++;
console.log(JSON.stringify({status:'passed',checks,isolated:true,liveBookingWrites:0}));
await db.close();
