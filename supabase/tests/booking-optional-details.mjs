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

const migration=await readFile(new URL('../migrations/20261017210100_booking_optional_details.sql',import.meta.url),'utf8');
const booking=(await db.query("insert into public.bookings(customer_name,arrival_at,departure_at) values('Unsplit imported Name','2026-10-17T07:00:00Z','2026-10-20T07:00:00Z') returning *")).rows[0];
await db.exec(migration);
await db.exec(migration); // IF NOT EXISTS protects an already provisioned schema.
const added=(await db.query('select * from public.bookings where id=$1',[booking.id])).rows[0];
for(const [key,value] of Object.entries(booking))assert.deepEqual(added[key],value);
for(const key of ['first_name','last_name','car_description'])assert.equal(added[key],null);
let checks=Object.keys(booking).length+3;
async function user(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
await user(driver);
for(const key of ['first_name','last_name','car_description']){
 await assert.rejects(db.query('select public.update_booking_ops($1,$2)',[booking.id,JSON.stringify({[key]:'unauthorized'})]),e=>e.code==='22023');checks++;
 assert.equal((await db.query('update public.bookings set '+key+"='unauthorized' where id=$1 returning id",[booking.id])).rows.length,0);checks++;
}
await user(admin);
await db.query("update public.bookings set first_name='Ada',last_name='van Example',car_description='Blue estate' where id=$1",[booking.id]);
const named=(await db.query('select * from public.bookings where id=$1',[booking.id])).rows[0];
assert.equal(named.customer_name,booking.customer_name);checks++;
for(const [key,size] of [['first_name',120],['last_name',120],['car_description',500]]){
 await db.query('update public.bookings set '+key+'=$1 where id=$2',['x'.repeat(size),booking.id]);checks++;
 await assert.rejects(db.query('update public.bookings set '+key+'=$1 where id=$2',['x'.repeat(size+1),booking.id]),e=>e.code==='23514');checks++;
 await db.query('update public.bookings set '+key+'=null where id=$1',[booking.id]);checks++;
}
console.log(JSON.stringify({status:'passed',checks,isolated:true,liveBookingWrites:0,originalColumnsPreserved:true}));
await db.close();
