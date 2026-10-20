// Isolated PostgreSQL WASM. Never connects to production.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
test('exact owner clear RPC, immutable history, idempotency and authorization',async()=>{
 const db=new PGlite();let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++};
 const admin='11111111-1111-4111-8111-111111111111',driver='22222222-2222-4222-8222-222222222222',inactive='33333333-3333-4333-8333-333333333333',bid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 let serial=1;const rid=()=>('00000000-0000-4000-8000-'+String(serial++).padStart(12,'0'));
 async function fail(sql,code){try{await db.exec(sql);assert.fail('Expected SQL error '+code)}catch(e){equal(e.code,code)}}
 const role=async(id=admin)=>db.exec(`reset role;set request.jwt.claim.sub='${id}';set role authenticated`);
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;`);
 for(const name of ['20261017090000_valet_backend.sql','20261017100000_booking_operational_actions.sql','20261017130000_retrieved_operation.sql','20261017170000_booking_handovers.sql','20261017180000_booking_handover_undo.sql','20261017190000_handover_lifecycle_cycles.sql','20261017200000_handover_conflict_http409.sql','20261017210000_booking_detail_actions.sql','20261017210100_booking_optional_details.sql','20261017220000_booking_payments.sql','20261017230000_booking_customer_calls.sql']){
  let sql;try{sql=await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')}catch(error){throw error;}await db.exec(sql);
 }
 await db.exec(`insert into auth.users values('${admin}','admin@test'),('${driver}','driver@test'),('${inactive}','inactive@test');
 insert into public.profiles(id,full_name,role,active) values('${admin}','Admin','admin',true),('${driver}','Driver','driver',true),('${inactive}','Inactive','driver',false);
 insert into public.bookings(id,code,customer_name,arrival_at,departure_at,total,paid,key_cash,spot)
 values('${bid}','SAFE','Legacy Full Name','2026-10-17Z','2026-10-18Z',100,0,'office','A1');`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261020070000_booking_customer_call_removals.sql',import.meta.url),'utf8'));
 const stamp=s=>s===null?'null':"'"+new Date(s).toISOString()+"'";
 const query=async sql=>(await db.query(sql)).rows;
 const rev=async()=>Number((await query('select count(*) n from public.booking_handover_undos'))[0].n);
 const current=async()=>(await query(`select customer_called_at from public.booking_operations where booking_id='${bid}'`))[0]?.customer_called_at??null;
 const call=async()=>{const x=(await query(`select public.record_booking_customer_call('${rid()}','${bid}',${stamp(await current())},null,${await rev()},true) r`))[0].r;return x.customer_called_at};

 const removeSQL=(at,id=rid(),revision=0,booking=bid)=>`select public.clear_booking_customer_call('${id}','${booking}',${stamp(at)},${revision}) r`;
 const remove=async(at,id=rid(),revision=0)=>(await query(removeSQL(at,id,revision)))[0].r;
 await role(driver);
 const a=await call(),b=await call(),c=await call();
 const originalHistory=await query(`select * from public.booking_call_history('${bid}')`);
 await db.exec('reset role');
 const originalBookings=await query('select * from public.bookings');
 const originalReceipts=await query('select * from public.booking_customer_call_receipts order by id');
 const originalEvents=await query('select * from public.booking_operation_events order by id');
 const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 await db.exec(`insert into public.bookings(id,code,customer_name,arrival_at,departure_at) values('${other}','OTHER','Untouched','2026-10-17Z','2026-10-18Z');
 update public.booking_operations set taken_away_at='2026-10-17T01:00Z',retrieved_at='2026-10-17T02:00Z',ride_started_at='2026-10-17T03:00Z' where booking_id='${bid}'`);
 const opsBefore=(await query(`select * from public.booking_operations where booking_id='${bid}'`))[0];
 await role(driver);
 const id=rid(),sql=removeSQL(c,id);
 const cleared=(await query(sql))[0].r;
 equal(cleared.customer_called_at,null); // NEVER restore a or b.
 equal((await query(sql))[0].r,cleared);
 equal(await current(),null);
 equal(await query(`select * from public.booking_call_history('${bid}')`),originalHistory);
 await fail(removeSQL(c),'PT409');
 await fail(removeSQL(null),'22023');
 await fail(`select public.clear_booking_customer_call('${rid()}','${bid}','infinity',0)`,'22023');
 await fail(removeSQL(c,rid(),-1),'22023');
 await fail(removeSQL(c,id,0,other),'23514');
 await fail(removeSQL(b,id),'23514');
 await fail(removeSQL(c,id,1),'23514');
 await role();await fail(sql,'23514');await role(driver);
 // Replay returns CURRENT canonical state, not historical clear result.
 const d=await call();
 equal((await query(sql))[0].r.customer_called_at,d);
 equal(new Date(await current()).toISOString(),new Date(d).toISOString());
 const opsAfter=(await query(`select * from public.booking_operations where booking_id='${bid}'`))[0];
 for(const field of Object.keys(opsBefore).filter(k=>!['customer_called_at','performed_by','updated_at'].includes(k)))equal(opsAfter[field],opsBefore[field]);
 await db.exec('reset role');
 equal(await query('select * from public.booking_customer_call_receipts order by id'),[...originalReceipts,...(await query('select * from public.booking_customer_call_receipts order by id')).filter(r=>!originalReceipts.some(o=>o.id===r.id))]);
 equal(await query('select * from public.booking_operation_events order by id'),originalEvents);
 equal(await query(`select * from public.bookings where id='${bid}'`),originalBookings);
 // Checkout is rejected, even with exact current call and revision.
 await db.exec(`update public.bookings set checked_in_at='2026-10-17T10:00Z',checked_out_at='2026-10-18T10:00Z' where id='${bid}'`);
 await role(driver);await fail(removeSQL(d),'23514');equal(new Date(await current()).toISOString(),new Date(d).toISOString());
 await db.exec('reset role');await db.exec(`update public.bookings set checked_in_at=null,checked_out_at=null,status='cancelled' where id='${bid}'`);
 await db.exec(`update public.booking_operations set customer_called_at=${stamp(d)} where booking_id='${bid}'`);
 await role(driver);await fail(removeSQL(d),'23514');
 await db.exec('reset role');await db.exec(`update public.bookings set status='confirmed',checked_in_at='2026-10-17T10:00Z' where id='${bid}'`);
 await role(driver);
 await db.exec(`select public.undo_booking_handover('${rid()}','${bid}','in','2026-10-17T10:00Z')`);
 // Recreate same timestamp to isolate lifecycle conflict from timestamp conflict.
 await db.exec('reset role');await db.exec(`update public.booking_operations set customer_called_at=${stamp(d)} where booking_id='${bid}'`);
 await role(driver);await fail(removeSQL(d),'PT409');
 equal((await query(sql))[0].r.lifecycle_revision,1);
 equal(new Date(await current()).toISOString(),new Date(d).toISOString());
 equal((await remove(d,rid(),1)).customer_called_at,null);
 // Legacy event stays in immutable history; clear still yields null.
 await db.exec('reset role');await db.exec(`update public.booking_operations set customer_called_at='2026-10-17T04:00Z' where booking_id='${bid}';
 insert into public.booking_operation_events(booking_id,action,occurred_at,actor_id) values('${bid}','customer_called','2026-10-17T04:00Z','${admin}')`);
 await role(driver);equal((await remove('2026-10-17T04:00Z',rid(),1)).customer_called_at,null);
 const finalHistory=await query(`select * from public.booking_call_history('${bid}')`);
 equal(finalHistory.length,5);
 await db.exec('reset role;set role anon');await fail(removeSQL(a),'42501');
 await role(inactive);await fail(removeSQL(a),'42501');
 await role('44444444-4444-4444-8444-444444444444');await fail(removeSQL(a),'42501');
 await db.exec("reset role;set request.jwt.claim.sub='';set role authenticated");await fail(removeSQL(a),'42501');
 await role(driver);
 equal((await query('select * from public.booking_customer_call_clear_receipts')).length,0);
 await fail('delete from public.booking_customer_call_clear_receipts','42501');
 await fail('update public.booking_customer_call_clear_receipts set expected_lifecycle_revision=0','42501');
 await fail(`insert into public.booking_customer_call_clear_receipts(id) values('${rid()}')`,'42501');
 await role();
 const receipts=await query('select * from public.booking_customer_call_clear_receipts order by id');
 equal(receipts.length,3);equal(receipts[0].actor_id,driver);
 await db.exec('reset role');
 await fail('delete from public.booking_customer_call_clear_receipts','42501');
 await fail('update public.booking_customer_call_clear_receipts set expected_lifecycle_revision=0','42501');
 await fail('update public.booking_customer_call_receipts set allow_repeat=false','42501');
 equal(await query('select * from public.booking_customer_call_clear_receipts order by id'),receipts);
 equal((await query("select * from public.audit_log where entity='booking_customer_call_clear_receipts'")).length,3);
 equal(await query(`select * from public.booking_call_history('${bid}')`),finalHistory);
 console.log('exact owner clear SQL checks',checks);
 }finally{await db.close()}
});
