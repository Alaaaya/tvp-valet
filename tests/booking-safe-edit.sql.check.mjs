// Local PostgreSQL WASM only. No network or application credentials.
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
test('safe edit exact migrations, roles, stale ABA, immutable replay and operational isolation',async()=>{
 const db=new PGlite();let checks=0;const equal=(a,b)=>{assert.deepEqual(a,b);checks++};
 const admin='11111111-1111-4111-8111-111111111111',driver='22222222-2222-4222-8222-222222222222',inactive='33333333-3333-4333-8333-333333333333',bid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 let serial=1;const rid=()=>('00000000-0000-4000-8000-'+String(serial++).padStart(12,'0'));
 const q=o=>"'"+JSON.stringify(o).replaceAll("'","''")+"'::jsonb";
 async function fail(sql,code){try{await db.exec(sql);assert.fail('Expected SQL error '+code)}catch(e){equal(e.code,code)}}
 const row=async()=> (await db.query('select * from public.bookings')).rows[0];
 const expected=async()=>{const b=await row();return{edit_revision:Number(b.edit_revision),detail_revision:Number(b.detail_revision),lifecycle_revision:Number((await db.query('select count(*) n from public.booking_handover_undos')).rows[0].n),status:b.status,checked_in_at:b.checked_in_at,checked_out_at:b.checked_out_at,spot:b.spot??''}};
 const rpc=(patch,e,id=rid())=>`select public.apply_booking_safe_edit('${id}','${bid}',${q(patch)},${q(e)})`;
 const role=async(id=admin)=>db.exec(`reset role;set request.jwt.claim.sub='${id}';set role authenticated`);
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create schema storage;create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;`);
 for(const name of ['20261017090000_valet_backend.sql','20261017100000_booking_operational_actions.sql','20261017130000_retrieved_operation.sql','20261017170000_booking_handovers.sql','20261017180000_booking_handover_undo.sql','20261017190000_handover_lifecycle_cycles.sql','20261017200000_handover_conflict_http409.sql','20261017210000_booking_detail_actions.sql','20261017210100_booking_optional_details.sql','20261017220000_booking_payments.sql','20261017230000_booking_customer_calls.sql']){
  let sql;try{sql=await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')}catch(error){if(error.code!=='ENOENT')throw error;sql=execFileSync('git',['show','main:supabase/migrations/'+name],{cwd:new URL('..',import.meta.url),encoding:'utf8'})}await db.exec(sql);
 }
 await db.exec(`insert into auth.users values('${admin}','admin@test'),('${driver}','driver@test'),('${inactive}','inactive@test');
 insert into public.profiles(id,full_name,role,active) values('${admin}','Admin','admin',true),('${driver}','Driver','driver',true),('${inactive}','Inactive','driver',false);
 insert into public.bookings(id,code,customer_name,arrival_at,departure_at,total,paid,key_cash,spot)
 values('${bid}','SAFE','Legacy Full Name','2026-10-17Z','2026-10-18Z',100,0,'office','A1');`);
 const before=await row();
 await db.exec(await readFile(new URL('../supabase/migrations/20261017240000_booking_safe_edit.sql',import.meta.url),'utf8'));
 const after=await row();delete after.edit_revision;equal(after,before);
 let e=await expected();
 await db.exec('set role anon');await fail(rpc({comment:'x'},e),'42501');
 await role(inactive);await fail(rpc({comment:'x'},e),'42501');
 await role(driver);
 for(const patch of [{phone:'x'},{customer_name:'x'},{arrival_at:'2027-01-01Z'}])await fail(rpc(patch,e),'42501');
 for(const field of ['paid','total','status','spot','driver_id','checked_in_at','actual_flight_out','edit_revision','customer_called_at'])await fail(rpc({[field]:null},e),'22023');
 const id=rid();const statement=rpc({comment:'new note',km:321},e,id);
 const freshEdit=(await db.query(statement)).rows[0].apply_booking_safe_edit;equal(freshEdit.lifecycle_revision,0);equal((await row()).customer_name,'Legacy Full Name');equal(Number((await row()).edit_revision),1);
 await db.exec(statement);equal(Number((await row()).edit_revision),1);
 await fail(rpc({comment:'changed'},e,id),'23514');
 await role();await fail(statement,'23514');
 e=await expected();
 for(const patch of [{first_name:'x'.repeat(121)},{last_name:'x'.repeat(121)},{car_description:'x'.repeat(501)},{persons:0},{persons:101},{km:-1},{km:1.5},{phone:'x'.repeat(65)}])await fail(rpc(patch,e),patch.km!==undefined?'22023':'23514');
 for(const patch of [{arrival_at:'infinity'},{departure_at:'2020-01-01Z'},{plate:''},{customer_name:null},{persons:'2'},{}])await fail(rpc(patch,e),'22023');
 // Atomic constraints failure never advances revision or creates receipt.
 equal(Number((await row()).edit_revision),1);
 // ABA through direct admin writes also increments server revision; forged revision ignored.
 await db.exec(`update public.bookings set phone='A',edit_revision=999 where id='${bid}';update public.bookings set phone=null,edit_revision=0 where id='${bid}'`);
 equal(Number((await row()).edit_revision),3);await fail(rpc({comment:'stale'},e),'PT409');
 e=await expected();await db.exec(rpc({first_name:'Explicit',last_name:'Person',customer_name:'Explicit Person',phone:'new'},e));
 equal((await row()).first_name,'Explicit');
 // Dedicated lifecycle writes invalidate snapshot, cannot be silently reset by edit.
 e=await expected();await db.exec('reset role');
 await db.exec(`update public.bookings set checked_in_at='2026-10-17T10:00Z' where id='${bid}'`);
 await role();await fail(rpc({comment:'stale lifecycle'},e),'PT409');
 e=await expected();await db.exec(rpc({comment:'checked in comment'},e));
 equal((await row()).checked_in_at.toISOString(),'2026-10-17T10:00:00.000Z');
 // Spot/status protected independently by detail revision including ABA.
 e=await expected();await db.exec('reset role');await db.exec(`update public.bookings set spot='B2';update public.bookings set spot='A1'`);await role();
 await fail(rpc({comment:'stale spot'},e),'PT409');
 // Payment and server customer-call records survive unrelated edit.
 e=await expected();await db.exec(`select public.record_booking_payment('${rid()}','${bid}',1000,'card',0,10000)`);
 await db.exec(`select public.record_booking_customer_call('${rid()}','${bid}',null,null,0,false)`);
 const operationsBefore=(await db.query('select * from public.booking_operations')).rows;
 await db.exec(rpc({comment:'after payment'},e));
 equal((await db.query('select * from public.booking_operations')).rows,operationsBefore);equal((await row()).paid,'10.00');equal((await row()).total,'100.00');equal((await row()).spot,'A1');
 await db.exec('reset role');await db.exec(`update public.bookings set key_cash='30€ Wael'`);await role();e=await expected();
 await fail(rpc({key_cash:''},e),'23514');equal((await row()).key_cash,'30€ Wael');
 await db.exec(rpc({comment:'numeric legacy retained'},e));
 // Actual undo RPC increments lifecycle receipt count. Restoring identical check-in time is ABA.
 e=await expected();
 await db.exec(`select public.undo_booking_handover('${rid()}','${bid}','in','2026-10-17T10:00Z')`);
 await db.exec('reset role');await db.exec(`update public.bookings set checked_in_at='2026-10-17T10:00Z'`);await role();
 await fail(rpc({comment:'lifecycle ABA'},e),'PT409');
 // Identical old retry after later operations returns current booking without reapplying note.
 await role(driver);const replayed=(await db.query(statement)).rows[0].apply_booking_safe_edit;
 equal(replayed.lifecycle_revision,1);equal(new Date(replayed.checked_in_at).toISOString(),'2026-10-17T10:00:00.000Z');
 equal((await row()).comment,'numeric legacy retained');await role();
 equal((await db.query('select count(*)::int n from public.booking_edit_receipts')).rows[0].n,5);
 await fail(`update public.booking_edit_receipts set patch='{}'`,'42501');await fail('delete from public.booking_edit_receipts','42501');
 await db.exec('reset role');await fail('delete from public.booking_edit_receipts','42501');
 const receipts=(await db.query('select * from public.booking_edit_receipts order by occurred_at')).rows;
 equal(receipts.length,5);equal(receipts[0].actor_id,driver);equal(receipts[0].patch,{km:321,comment:'new note'});equal(receipts[0].before_data.comment,null);equal(receipts[0].after_data.comment,'new note');
 console.log('safe edit SQL checks',checks);
 }finally{await db.close()}
});
