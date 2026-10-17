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
// Apply every current migration in timestamp order, with latest lifecycle/409 from main.
// Explicit sources prevent silently omitting migrations absent from this feature worktree.
const feature=new URL('../migrations/',import.meta.url);
const main='/home/kit/tvp-valet/supabase/migrations/';
const migrationNames=[
 '20261017090000_valet_backend.sql',
 '20261017100000_booking_operational_actions.sql',
 '20261017130000_retrieved_operation.sql',
 '20261017150000_public_flight_budget.sql',
 '20261017170000_booking_handovers.sql',
 '20261017180000_booking_handover_undo.sql',
 '20261017190000_handover_lifecycle_cycles.sql',
 '20261017200000_handover_conflict_http409.sql',
 '20261017210000_booking_detail_actions.sql',
 '20261017210100_booking_optional_details.sql',
 '20261017220000_booking_payments.sql',
 '20261017230000_booking_customer_calls.sql'
];
await db.exec("alter table storage.objects add column metadata jsonb");
for(const name of migrationNames){
 const source=name.startsWith('20261017190000')||name.startsWith('20261017200000')?main+name:new URL(name,feature);
 await db.exec(await readFile(source,'utf8'));
}
console.log('Applied combined migrations',migrationNames);
const admin='00000000-0000-4000-8000-000000000001',driver='00000000-0000-4000-8000-000000000002';
await db.query('insert into auth.users(id) values($1),($2)',[admin,driver]);
await db.query("insert into public.profiles(id,full_name,role) values($1,'Test Admin','admin'),($2,'Test Driver','driver')",[admin,driver]);



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
// Additional combined payment/action coverage follows.

const sqlRow=async(id)=>(await db.query('select * from public.bookings where id=$1',[id])).rows[0];
const sqlOps=async(id)=>(await db.query('select * from public.booking_operations where booking_id=$1',[id])).rows[0];
const revision=async(id)=>Number((await db.query('select count(*) as n from public.booking_handover_undos where booking_id=$1',[id])).rows[0].n);
async function complete(id,kind,details={}){
 const row=await sqlRow(id);
 return (await db.query('select * from public.complete_booking_handover($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8)',
  [randomUUID(),id,kind,JSON.stringify(details),'[]',row.checked_in_at,row.checked_out_at,await revision(id)])).rows[0];
}
async function detail(id,action,target){
 const row=await sqlRow(id);
 const expected={status:row.status,checked_in_at:row.checked_in_at,checked_out_at:row.checked_out_at,
 spot:row.spot||'',lifecycle_revision:await revision(id),detail_revision:Number(row.detail_revision)};
 return (await db.query('select * from public.apply_booking_detail_action($1,$2,$3,$4,$5::jsonb)',
  [randomUUID(),id,action,target,JSON.stringify(expected)])).rows[0];
}
async function payment(id,amount,method='cash',request=randomUUID(),expectedPaid,expectedTotal){
 const row=await sqlRow(id);
 return (await db.query('select * from public.record_booking_payment($1,$2,$3,$4,$5,$6)',
  [request,id,amount,method,expectedPaid??Math.round(Number(row.paid)*100),expectedTotal??Math.round(Number(row.total)*100)])).rows[0];
}
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
await db.exec('reset role');
await db.query('update public.profiles set active=true where id=$1',[driver]);
const mixed=await fresh();
await db.query("update public.bookings set total=100,first_name='Fixture',last_name='Combined',car_description='Test' where id=$1",[mixed.id]);
await user(driver);
const paymentRequest=randomUUID();
const receipt=await payment(mixed.id,1000,'cash',paymentRequest);
eq((await sqlRow(mixed.id)).paid,'10.00');
await complete(mixed.id,'in',{comment:'Combined check-in'});
await detail(mixed.id,'spot','P-12');
const called=await call(mixed);
await db.query("select public.record_booking_operation($1,'ride_started')",[mixed.id]);
await complete(mixed.id,'out',{comment:'Combined check-out'});
let checked=await sqlRow(mixed.id);
await reject(()=>detail(mixed.id,'spot','P-13'),'23514');
await user(admin);
await reject(()=>detail(mixed.id,'status','cancelled'),'23514');
await reject(()=>db.query("update public.bookings set paid=0 where id=$1",[mixed.id]),'42501');
await user(driver);
await db.query("select public.undo_booking_handover($1,$2,'out',$3)",[randomUUID(),mixed.id,checked.checked_out_at]);
eq(new Date((await sqlOps(mixed.id)).customer_called_at).toISOString(),new Date(called.customer_called_at).toISOString());
eq((await sqlRow(mixed.id)).paid,'10.00');
await payment(mixed.id,2000,'card');
eq((await sqlRow(mixed.id)).paid,'30.00');
eq(await payment(mixed.id,1000,'cash',paymentRequest,0,10000),receipt);
await detail(mixed.id,'spot','P-13');
checked=await sqlRow(mixed.id);
await db.query("select public.undo_booking_handover($1,$2,'in',$3)",[randomUUID(),mixed.id,checked.checked_in_at]);
const cleared=await sqlOps(mixed.id);
for(const key of ['customer_called_at','ride_started_at','taken_away_at','retrieved_at'])eq(cleared[key],null);
eq((await sqlRow(mixed.id)).paid,'30.00');
eq((await db.query('select * from public.booking_call_history($1)',[mixed.id])).rows.length,1);
await user(admin);
await detail(mixed.id,'status','cancelled');
eq((await sqlRow(mixed.id)).status,'cancelled');
await reject(()=>payment(mixed.id,1000),'23514');
await user(driver);
eq(await payment(mixed.id,1000,'cash',paymentRequest,0,10000),receipt);
eq((await sqlRow(mixed.id)).first_name,'Fixture');
eq((await sqlRow(mixed.id)).car_description,'Test');
eq((await db.query('select count(*)::int as n from public.booking_payments where booking_id=$1',[mixed.id])).rows[0].n,2);
// New payment cash guard must also apply inside the handover core, atomically.
const guarded=await fresh();
await db.query('update public.bookings set total=100 where id=$1',[guarded.id]);
await user(driver);await payment(guarded.id,1000);
await reject(()=>complete(guarded.id,'in',{key_cash:'10 Driver'}),'23514');
eq((await sqlRow(guarded.id)).checked_in_at,null);
eq((await db.query('select count(*)::int as n from public.booking_handovers where booking_id=$1',[guarded.id])).rows[0].n,0);
await complete(guarded.id,'in',{key_cash:'Office'});
eq((await sqlRow(guarded.id)).key_cash,'Office');
eq((await sqlRow(guarded.id)).paid,'10.00');
// Historical cash cannot disappear through any ordinary mutation route.
const historical=await fresh();
await db.query("update public.bookings set total=100,key_cash='10€ Wael' where id=$1",[historical.id]);
await user(driver);
for(const value of ['',null,'Office','20€ Alaa']){
 await reject(()=>db.query("select public.update_booking_ops($1,$2::jsonb)",[historical.id,JSON.stringify({key_cash:value})]),'23514');
}
await reject(()=>complete(historical.id,'in',{key_cash:''}),'23514');
eq((await sqlRow(historical.id)).checked_in_at,null);
await user(admin);
await reject(()=>db.query("update public.bookings set key_cash=null where id=$1",[historical.id]),'23514');
await reject(()=>db.query("update public.bookings set key_cash='' where id=$1",[historical.id]),'23514');
// Unchanged legacy value must not block unrelated actions or noncash receipts.
await detail(historical.id,'spot','P-20');
await payment(historical.id,1000,'card');
eq((await sqlRow(historical.id)).key_cash,'10€ Wael');
await complete(historical.id,'in',{key_cash:'10€ Wael'});
eq((await sqlRow(historical.id)).paid,'10.00');
// Payment guards and lifecycle guards reject stale direct admin payloads atomically.
const beforeUnrelatedComment=(await sqlRow(historical.id)).comment;
await reject(()=>db.query("update public.bookings set paid=0,comment='stale payment' where id=$1",[historical.id]),'42501');
eq((await sqlRow(historical.id)).comment,beforeUnrelatedComment);
await reject(()=>db.query("update public.bookings set checked_in_at=null,comment='stale lifecycle' where id=$1",[historical.id]),'42501');
eq((await sqlRow(historical.id)).comment,beforeUnrelatedComment);
await user(driver);
const beforeHistorical=await sqlRow(historical.id);
await db.query("select public.undo_booking_handover($1,$2,'in',$3)",[randomUUID(),historical.id,beforeHistorical.checked_in_at]);
eq((await sqlRow(historical.id)).key_cash,'10€ Wael');
eq((await sqlRow(historical.id)).paid,'10.00');
console.log(JSON.stringify({status:'passed',checks,migrations:migrationNames.length,isolated:true,liveWrites:0,
 note:'PGlite single-session transaction semantics, not a multi-connection lock test'}));
await db.close();
