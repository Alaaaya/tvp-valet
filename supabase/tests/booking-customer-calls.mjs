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
await db.exec(await readFile(process.env.TVP_LIFECYCLE_MIGRATION || '/home/kit/tvp-valet/supabase/migrations/20261017190000_handover_lifecycle_cycles.sql','utf8'));
await db.exec(await readFile(new URL('../migrations/20261017210000_booking_detail_actions.sql',import.meta.url),'utf8'));
const admin='00000000-0000-4000-8000-000000000001',driver='00000000-0000-4000-8000-000000000002';
await db.query('insert into auth.users(id) values($1),($2)',[admin,driver]);
await db.query("insert into public.profiles(id,full_name,role) values($1,'Test Admin','admin'),($2,'Test Driver','driver')",[admin,driver]);


await db.exec(await readFile(new URL('../migrations/20261017230000_booking_customer_calls.sql',import.meta.url),'utf8'));
let checks=0;
const {randomUUID}=await import('node:crypto');
async function user(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);}
async function fresh(){
 await db.exec('reset role');
 return (await db.query("insert into public.bookings(customer_name,arrival_at,departure_at) values('Isolated call','2026-10-17T07:00:00Z','2026-10-20T07:00:00Z') returning *")).rows[0];
}
async function reject(fn,code){checks++;await assert.rejects(fn,e=>{assert.equal(e.code,code,e.message);return true;});}
async function call(b,{request=randomUUID(),called=null,out=null,revision=0,repeat=false}={}){
 return (await db.query('select public.record_booking_customer_call($1,$2,$3,$4,$5,$6) as result',[request,b.id,called,out,revision,repeat])).rows[0].result;
}
let b=await fresh();
await user('','anon');await reject(()=>call(b),'42501');
await user(driver);
const request=randomUUID(),before=new Date();
const first=await call(b,{request});
assert.ok(new Date(first.occurred_at)>=before);checks++;
assert.deepEqual(await call(b,{request}),first);checks++;
await reject(()=>call(b,{request,repeat:true}),'23514');
await reject(()=>call(b),'PT409');
await reject(()=>call(b,{called:first.customer_called_at}),'23514');
await reject(()=>call(b,{called:first.customer_called_at,revision:-1,repeat:true}),'22023');
const second=await call(b,{called:first.customer_called_at,repeat:true});
assert.ok(new Date(second.customer_called_at)>new Date(first.customer_called_at));checks++;
const retried=await call(b,{request});
assert.equal(retried.customer_called_at,second.customer_called_at);assert.equal(retried.occurred_at,first.occurred_at);checks+=2;
let history=(await db.query('select * from public.booking_call_history($1)',[b.id])).rows;
assert.equal(history.length,2);assert.ok(history.every(h=>h.id<0));checks+=2;
// Old API is idempotent and cannot replace the new call timestamp or insert duplicate history.
await db.query("select public.record_booking_operation($1,'customer_called')",[b.id]);
assert.equal((await db.query('select * from public.booking_call_history($1)',[b.id])).rows.length,2);checks++;
assert.equal((await db.query('select * from public.booking_customer_call_receipts')).rows.length,0);checks++;
await reject(()=>db.query("delete from public.booking_customer_call_receipts"),'42501');
await user(admin);await reject(()=>call(b,{request}),'23514');
await db.exec('reset role');
await reject(()=>db.query("update public.booking_customer_call_receipts set allow_repeat=false"),'42501');
assert.equal(Number((await db.query("select count(*) as n from public.audit_log where entity='booking_customer_call_receipts'")).rows[0].n),2);checks++;
// Legacy initial call and repeat receipt appear once each.
b=await fresh();await user(driver);
const legacy=(await db.query("select * from public.record_booking_operation($1,'customer_called')",[b.id])).rows[0];
await call(b,{called:legacy.customer_called_at,repeat:true});
history=(await db.query('select * from public.booking_call_history($1)',[b.id])).rows;
assert.equal(history.length,2);assert.ok(history.some(h=>h.id>0));assert.ok(history.some(h=>h.id<0));checks+=3;
// Undo checkout retains canonical call. Recheckout freezes it; new calls rejected.
await db.query("select public.check_booking($1,'in')",[b.id]);
await db.query("select public.check_booking($1,'out')",[b.id]);
let state=(await db.query('select * from public.bookings where id=$1',[b.id])).rows[0];
let ops=(await db.query('select * from public.booking_operations where booking_id=$1',[b.id])).rows[0];
await reject(()=>call(b,{called:ops.customer_called_at,out:state.checked_out_at,repeat:true}),'23514');
await db.query("select public.undo_booking_handover($1,$2,'out',$3)",[randomUUID(),b.id,state.checked_out_at]);
assert.equal((await db.query('select * from public.booking_operations where booking_id=$1',[b.id])).rows[0].customer_called_at.toISOString(),ops.customer_called_at.toISOString());checks++;
await reject(()=>call(b,{called:ops.customer_called_at,repeat:true}),'PT409');
await call(b,{called:ops.customer_called_at,revision:1,repeat:true});
await db.query("select public.check_booking($1,'out')",[b.id]);
const frozen=(await db.query('select * from public.booking_operations where booking_id=$1',[b.id])).rows[0].customer_called_at;
await reject(()=>call(b,{called:frozen,revision:1,repeat:true}),'PT409');
// Undo check-in clears operational timestamp but history survives and revision stops ABA.
b=await fresh();await user(driver);const initial=await call(b);
await db.query("select public.check_booking($1,'in')",[b.id]);
state=(await db.query('select * from public.bookings where id=$1',[b.id])).rows[0];
await db.query("select public.undo_booking_handover($1,$2,'in',$3)",[randomUUID(),b.id,state.checked_in_at]);
assert.equal((await db.query('select * from public.booking_operations where booking_id=$1',[b.id])).rows[0].customer_called_at,null);checks++;
assert.equal((await db.query('select * from public.booking_call_history($1)',[b.id])).rows.length,1);checks++;
await reject(()=>call(b),'PT409');
await call(b,{revision:1});
assert.equal((await db.query('select * from public.booking_call_history($1)',[b.id])).rows.length,2);checks++;
// Competing calls on the same snapshot yield exactly one receipt, not two overwrites.
const raceBooking=await fresh();await user(driver);
const race=await Promise.allSettled([call(raceBooking),call(raceBooking)]);
assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
assert.equal(race.filter(x=>x.status==='rejected'&&x.reason.code==='PT409').length,1);checks+=2;
assert.equal((await db.query('select * from public.booking_call_history($1)',[raceBooking.id])).rows.length,1);checks++;
// A future stored timestamp cannot be overwritten by a nominally confirmed repeat.
await db.exec('reset role');
await db.query("update public.booking_operations set customer_called_at='2099-01-01' where booking_id=$1",[raceBooking.id]);
await user(driver);
await reject(()=>call(raceBooking,{called:'2099-01-01',repeat:true}),'23514');
// Request collision across bookings never changes the other row.
const other=await fresh();await user(driver);
await reject(()=>call(other,{request}),'23514');
await db.exec('reset role');await db.query("update public.bookings set status='cancelled' where id=$1",[other.id]);
await user(driver);await reject(()=>call(other),'23514');
await db.exec('reset role');await db.query('update public.profiles set active=false where id=$1',[driver]);
await user(driver);await reject(()=>call(other),'42501');
await reject(()=>db.query('select * from public.booking_call_history($1)',[b.id]),'42501');
await db.exec('reset role');
const funcs=(await db.query("select prosecdef,proconfig from pg_proc where proname in ('record_booking_customer_call','booking_call_history')")).rows;
for(const f of funcs){assert.ok(f.prosecdef);assert.ok(f.proconfig.includes('search_path=""'));checks+=2;}
console.log(JSON.stringify({status:'passed',checks,isolated:true,liveWrites:0}));
await db.close();
