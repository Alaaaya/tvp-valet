/** Isolated PostgreSQL semantics/RLS test for clear_booking_customer_call. Does not connect to live data.
 * TVP_PGLITE_MODULE=/tmp/tvp-dbtest/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/booking-customer-call-clear.mjs
 */
import {readFile,readdir} from 'node:fs/promises';
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
const dir=new URL('../migrations/',import.meta.url);
const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')).sort();
assert.ok(names.includes('20261020070000_booking_customer_call_clear.sql'));
for(const name of names){
 if(name==='20261017170000_booking_handovers.sql')await db.exec("alter table storage.objects add column metadata jsonb");
 await db.exec(await readFile(new URL(name,dir),'utf8'));
}
const admin='00000000-0000-4000-8000-000000000001',driver='00000000-0000-4000-8000-000000000002';
await db.query('insert into auth.users(id) values($1),($2)',[admin,driver]);
await db.query("insert into public.profiles(id,full_name,role) values($1,'Test Admin','admin'),($2,'Test Driver','driver')",[admin,driver]);
let checks=0;
const {randomUUID}=await import('node:crypto');
async function user(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);}
async function fresh(){
 await db.exec('reset role');
 return (await db.query("insert into public.bookings(customer_name,arrival_at,departure_at) values('Isolated clear','2026-10-17T09:00:00+02:00','2026-10-20T09:00:00+02:00') returning *")).rows[0];
}
async function reject(fn,code){checks++;await assert.rejects(fn,e=>{assert.equal(e.code,code,e.message);return true;});}
async function call(b,{request=randomUUID(),called=null,revision=0,repeat=false}={}){
 return (await db.query('select public.record_booking_customer_call($1,$2,$3,$4,$5,$6) as result',[request,b.id,called,null,revision,repeat])).rows[0].result;
}
async function clear(b,{request=randomUUID(),called,revision=0}={}){
 return (await db.query('select public.clear_booking_customer_call($1,$2,$3,$4) as result',[request,b.id,called,revision])).rows[0].result;
}
const opsOf=async id=>{await db.exec('reset role');const r=(await db.query('select * from public.booking_operations where booking_id=$1',[id])).rows[0];return r;};
let b=await fresh();
await user(driver);
const first=await call(b);
await user('','anon');await reject(()=>clear(b,{called:first.customer_called_at}),'42501');
await user(driver);
await reject(()=>clear(b,{called:null}),'22023');
await reject(()=>clear(b,{called:first.customer_called_at,revision:-1}),'22023');
await reject(()=>clear(b,{called:'2020-01-01T00:00:00Z'}),'PT409');
await reject(()=>clear(b,{called:first.customer_called_at,revision:1}),'PT409');
const request=randomUUID();
const res=await clear(b,{request,called:first.customer_called_at});
assert.equal(res.receipt_id,request);assert.equal(res.customer_called_at,null);assert.equal(res.lifecycle_revision,0);checks+=3;
assert.equal((await opsOf(b.id)).customer_called_at,null);checks++;
// Idempotent retry returns the same receipt; mismatched reuse is rejected.
await user(driver);
assert.deepEqual(await clear(b,{request,called:first.customer_called_at}),res);checks++;
await user(admin);await reject(()=>clear(b,{request,called:first.customer_called_at}),'23514');
// Stale second clear (already null) fails as changed.
await user(driver);await reject(()=>clear(b,{called:first.customer_called_at}),'PT409');
// History stays as audit trail; a new call after clearing is a normal first call.
await db.exec('reset role');
assert.equal((await db.query('select * from public.booking_call_history($1)',[b.id])).rows.length,1);checks++;
await user(driver);
await reject(()=>call(b,{called:first.customer_called_at,repeat:true}),'PT409');
const again=await call(b);
assert.ok(again.customer_called_at);checks++;
// Ledger is immutable and audited.
await db.exec('reset role');
await reject(()=>db.query('delete from public.booking_customer_call_clear_receipts'),'42501');
await reject(()=>db.query("update public.booking_customer_call_clear_receipts set expected_lifecycle_revision=5"),'42501');
assert.equal(Number((await db.query("select count(*) as n from public.audit_log where entity='booking_customer_call_clear_receipts'")).rows[0].n),1);checks++;
// Drivers cannot read the ledger directly; admins can.
await user(driver);assert.equal((await db.query('select * from public.booking_customer_call_clear_receipts')).rows.length,0);checks++;
await user(admin);assert.equal((await db.query('select * from public.booking_customer_call_clear_receipts')).rows.length,1);checks++;
// Checked-out booking cannot be cleared (call frozen); cancelled neither.
b=await fresh();await user(driver);
const c2=await call(b);
await db.query("select public.check_booking($1,'in')",[b.id]);
await db.query("select public.check_booking($1,'out')",[b.id]);
await reject(()=>clear(b,{called:c2.customer_called_at}),'23514');
b=await fresh();await user(driver);const c3=await call(b);
await db.exec('reset role');await db.query("update public.bookings set status='cancelled' where id=$1",[b.id]);
await user(driver);await reject(()=>clear(b,{called:c3.customer_called_at}),'23514');
// Competing clears on the same snapshot: exactly one wins.
b=await fresh();await user(driver);const c4=await call(b);
const race=await Promise.allSettled([clear(b,{called:c4.customer_called_at}),clear(b,{called:c4.customer_called_at})]);
assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
assert.equal(race.filter(x=>x.status==='rejected'&&x.reason.code==='PT409').length,1);checks+=2;
// Inactive staff denied.
b=await fresh();await user(driver);const c5=await call(b);
await db.exec('reset role');await db.query('update public.profiles set active=false where id=$1',[driver]);
await user(driver);await reject(()=>clear(b,{called:c5.customer_called_at}),'42501');
await db.exec('reset role');
const f=(await db.query("select prosecdef,proconfig from pg_proc where proname='clear_booking_customer_call'")).rows[0];
assert.ok(f.prosecdef);assert.ok(f.proconfig.includes('search_path=""'));checks+=2;
const anonExec=(await db.query("select has_function_privilege('anon','public.clear_booking_customer_call(uuid,uuid,timestamptz,bigint)','execute') as x")).rows[0].x;
assert.equal(anonExec,false);checks++;
console.log(JSON.stringify({status:'passed',checks,isolated:true,liveWrites:0}));
await db.close();
