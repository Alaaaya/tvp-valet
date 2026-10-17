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
// Full additive lifecycle baseline.
await db.exec("alter table storage.objects add column metadata jsonb");
for(const name of ['20261017170000_booking_handovers.sql','20261017180000_booking_handover_undo.sql'])
 await db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
if(process.env.TVP_LIFECYCLE_MIGRATION)await db.exec(await readFile(process.env.TVP_LIFECYCLE_MIGRATION,'utf8'));
await db.exec(await readFile(new URL('../migrations/20261017210000_booking_detail_actions.sql',import.meta.url),'utf8'));
const admin='00000000-0000-4000-8000-000000000001',driver='00000000-0000-4000-8000-000000000002';
await db.query('insert into auth.users(id) values($1),($2)',[admin,driver]);
await db.query("insert into public.profiles(id,full_name,role) values($1,'Test Admin','admin'),($2,'Test Driver','driver')",[admin,driver]);

let checks=0;
const {randomUUID}=await import('node:crypto');
async function user(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);}
async function fresh(){
 await db.exec('reset role');
 return (await db.query("insert into public.bookings(customer_name,arrival_at,departure_at,spot) values('Isolated test','2026-10-17T07:00:00Z','2026-10-20T07:00:00Z','A1') returning *")).rows[0];
}
function snapshot(b,revision=0){return {status:b.status,checked_in_at:b.checked_in_at,checked_out_at:b.checked_out_at,spot:b.spot,lifecycle_revision:revision};}
async function action(b,kind,target,request=randomUUID(),expected=snapshot(b)){
 return (await db.query('select * from public.apply_booking_detail_action($1,$2,$3,$4,$5)',[request,b.id,kind,target,JSON.stringify(expected)])).rows[0];
}
async function reject(fn,code){checks++;await assert.rejects(fn,e=>{assert.equal(e.code,code,e.message);return true;});}
let b=await fresh();
await user('', 'anon');await reject(()=>action(b,'spot','B2'),'42501');
await user(driver);await reject(()=>action(b,'status','cancelled'),'42501');
const req=randomUUID();
let moved=await action(b,'spot','B2',req);assert.equal(moved.spot,'B2');checks++;
assert.deepEqual(await action(b,'spot','B2',req),moved);checks++;
await reject(()=>action(b,'spot','C3',req),'23514');
await reject(()=>action(b,'spot','C3'),'40001');
await reject(()=>action(moved,'spot',''),'22023');
await reject(()=>action(moved,'spot','x'.repeat(101)),'22023');
await reject(()=>action(moved,'spot',' B2'),'22023');
await reject(()=>action(moved,'spot','B2'),'22023');
await reject(()=>action(moved,'status','confirmed'),'42501');
const locations=(await db.query('select * from public.booking_location_history($1)',[b.id])).rows;
assert.equal(locations.length,2);assert.equal(locations[1].old_spot,'A1');assert.equal(locations[1].new_spot,'B2');assert.equal(locations[1].actor_id,driver);checks+=4;
assert.deepEqual(Object.keys(locations[1]).sort(),['id','occurred_at','actor_id','actor_name','old_spot','new_spot'].sort());checks++;
assert.equal((await db.query('select * from public.booking_call_history($1)',[b.id])).rows.length,0);checks++;
await db.query("select public.record_booking_operation($1,'customer_called')",[b.id]);
const calls=(await db.query('select * from public.booking_call_history($1)',[b.id])).rows;
assert.equal(calls.length,1);assert.equal(calls[0].actor_id,driver);checks+=2;
// Drivers do not gain raw audit or receipt access.
assert.equal((await db.query('select * from public.audit_log')).rows.length,0);checks++;
assert.equal((await db.query('select * from public.booking_detail_action_receipts')).rows.length,0);checks++;
await user(admin);await reject(()=>action(b,'spot','B2',req),'23514');
const c=await action(moved,'status','cancelled');assert.equal(c.status,'cancelled');checks++;
assert.equal(c.checked_in_at,null);assert.equal(c.checked_out_at,null);checks+=2;
await reject(()=>action(c,'spot','C3'),'23514');
await reject(()=>action(c,'status','no_show'),'23514');
// Preserve historical timestamps and reject both no_show and cancel after check-in/out.
for(const complete of [false,true]){
 b=await fresh();await user(admin);
 await db.query("select public.check_booking($1,'in')",[b.id]);
 if(complete)await db.query("select public.check_booking($1,'out')",[b.id]);
 const checked=(await db.query('select * from public.bookings where id=$1',[b.id])).rows[0];
 for(const status of ['no_show','cancelled'])await reject(()=>action(checked,'status',status),'23514');
 if(complete)await reject(()=>action(checked,'spot','Z9'),'23514');
 assert.deepEqual((await db.query('select * from public.bookings where id=$1',[b.id])).rows[0],checked);checks++;
}
// ABA after explicit undo rejected even though current endpoints once again null.
b=await fresh();await user(admin);
await db.query("select public.check_booking($1,'in')",[b.id]);
const checked=(await db.query('select * from public.bookings where id=$1',[b.id])).rows[0];
await db.query("select public.undo_booking_handover($1,$2,'in',$3)",[randomUUID(),b.id,checked.checked_in_at]);
await reject(()=>action(b,'status','no_show'),'40001');
const ns=await action(b,'status','no_show',randomUUID(),snapshot(b,1));assert.equal(ns.status,'no_show');checks++;
await reject(()=>db.query("delete from public.booking_detail_action_receipts"),'42501');
await db.exec('reset role');
await reject(()=>db.query("update public.booking_detail_action_receipts set target='evil'"),'42501');
await db.query('update public.profiles set active=false where id=$1',[driver]);
await user(driver);
for(const fn of ['booking_call_history','booking_location_history'])await reject(()=>db.query('select * from public.'+fn+'($1)',[b.id]),'42501');
await reject(()=>action(b,'spot','Z9'),'42501');
await user('','anon');
for(const fn of ['booking_call_history','booking_location_history'])await reject(()=>db.query('select * from public.'+fn+'($1)',[b.id]),'42501');
await db.exec('reset role');
const funcs=(await db.query("select proname,prosecdef,proconfig from pg_proc where proname in ('apply_booking_detail_action','booking_call_history','booking_location_history')")).rows;
for(const f of funcs){assert.ok(f.prosecdef);assert.ok(f.proconfig.includes('search_path=""'));checks+=2;}
console.log(JSON.stringify({status:'passed',checks,isolated:true,liveBookingWrites:0}));
await db.close();
