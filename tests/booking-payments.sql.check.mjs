// Isolated native PostgreSQL WASM test. No network, credentials or production writes.
// PGLITE_MODULE=/tmp/tvp-dbtest/node_modules/@electric-sql/pglite/dist/index.js node --test tests/booking-payments.sql.check.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
test('exact payment migration: permissions, atomicity, snapshots, immutable context and legacy protection',async()=>{
 const db=new PGlite();
 let assertions=0;
 const check=(actual,expected)=>{assert.deepEqual(actual,expected);assertions++;};
 async function fail(sql,code){
  try{await db.exec(sql);assert.fail('Expected SQL rejection');}
  catch(error){check(error.code,code);}
 }
 try{
  await db.exec(`
   create role anon; create role authenticated; create role service_role;
   create schema auth; create schema storage;
   create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated,anon;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid,bucket_id text,name text,metadata jsonb);
   alter table storage.objects enable row level security;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20261017090000_valet_backend.sql',import.meta.url),'utf8'));
  const admin='11111111-1111-4111-8111-111111111111',driver='22222222-2222-4222-8222-222222222222',inactive='33333333-3333-4333-8333-333333333333';
  const booking='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',legacy='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',other='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const request='dddddddd-dddd-4ddd-8ddd-dddddddddddd',request2='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  await db.exec(`
   insert into auth.users values ('${admin}','admin@test'),('${driver}','staff@test'),('${inactive}','inactive@test');
   insert into public.profiles(id,full_name,role,active) values
    ('${admin}','Admin','admin',true),('${driver}','Employee Server Name','driver',true),('${inactive}','Inactive','driver',false);
   insert into public.bookings(id,code,customer_name,arrival_at,departure_at,total,paid,key_cash) values
    ('${booking}','TEST1','Fixture','2026-10-17Z','2026-10-18Z',100,10,null),
    ('${legacy}','TEST2','Fixture','2026-10-17Z','2026-10-18Z',100,0,'30€ Wael'),
    ('${other}','TEST3','Fixture','2026-10-17Z','2026-10-18Z',100,0,null);
  `);
  const before=(await db.query('select id,paid,total,key_cash from public.bookings order by id')).rows;
  await db.exec(await readFile(new URL('../supabase/migrations/20261017220000_booking_payments.sql',import.meta.url),'utf8'));
  check((await db.query('select id,paid,total,key_cash from public.bookings order by id')).rows,before);
  check((await db.query('select count(*)::int as n from public.booking_payments')).rows[0].n,0);
  const rpc=(id=request,b=booking,amount='2000',method='cash',paid='1000',total='10000')=>
   `select * from public.record_booking_payment('${id}','${b}',${amount},'${method}',${paid},${total})`;
  await db.exec("set role anon");
  await fail(rpc(),'42501');
  await db.exec(`reset role; set request.jwt.claim.sub='${inactive}'; set role authenticated`);
  await fail(rpc(),'42501');
  await db.exec(`reset role; set request.jwt.claim.sub='${driver}'; set role authenticated`);
  for(const bad of ['0','-1','1.1',"'NaN'::numeric","'Infinity'::numeric","'-Infinity'::numeric",'1000000000000'])
   await fail(rpc(request,booking,bad),'22023');
  await fail(rpc(request,booking,'2000','cash','999'),'PT409');
  await fail(rpc(request,booking,'9001'),'23514');
  await fail(rpc(request,legacy,'1000','cash','0'),'23514');
  check((await db.query("update public.bookings set paid=20 where code='TEST1' returning id")).rows,[]);
  const first=(await db.query(rpc())).rows[0];
  check(first.actor_id,driver);check(first.actor_name,'Employee Server Name');
  check(Number(first.amount_cents),2000);check(Number(first.paid_after_cents),3000);
  check((await db.query(`select paid from public.bookings where id='${booking}'`)).rows[0].paid,'30.00');
  check((await db.query(rpc())).rows[0],first);
  await fail(rpc(request,booking,'2001'),'23514');
  await fail(rpc(request,booking,'2000','card'),'23514');
  await fail(rpc(request,other),'23514');
  await fail(rpc(request,booking,'2000','cash','3000'),'23514');
  await fail(rpc(request2,booking,'2000'),'PT409');
  await fail(`update public.booking_payments set amount_cents=1 where id='${request}'`,'42501');
  await fail(`delete from public.booking_payments where id='${request}'`,'42501');
  await fail(`insert into public.booking_payments select * from public.booking_payments`,'42501');
  await fail(`select public.update_booking_ops('${booking}','{"key_cash":"20€ Staff"}')`,'23514');
  await db.exec(`select public.update_booking_ops('${booking}','{"key_cash":"Schlüssel im Büro"}')`);
  await db.query(rpc(request2,booking,'7000','card','3000'));
  check((await db.query(rpc())).rows[0],first);
  check((await db.query(`select paid from public.bookings where id='${booking}'`)).rows[0].paid,'100.00');
  await fail(rpc('ffffffff-ffff-4fff-8fff-ffffffffffff',booking,'1','cash','10000'),'23514');
  await db.exec(`reset role; set request.jwt.claim.sub='${admin}'; set role authenticated`);
  await fail(rpc(),'23514');
  await fail(`update public.bookings set paid=0 where id='${booking}'`,'42501');
  await fail(`delete from public.bookings where id='${booking}'`,'23001');
  check((await db.query("select count(*)::int as n from public.audit_log where entity='booking_payments'")).rows[0].n,2);
  await db.query(rpc('ffffffff-ffff-4fff-8fff-ffffffffffff',legacy,'1000','bank_transfer','0'));
  check((await db.query(`select key_cash from public.bookings where id='${legacy}'`)).rows[0].key_cash,'30€ Wael');
  await db.exec('reset role');
  // A failing booking write must roll back the newly inserted receipt and its audit.
  await db.exec(`create function public.fixture_reject_payment() returns trigger language plpgsql as
   $$ begin raise exception 'Fixture write failure' using errcode='23514'; end $$;
   create trigger fixture_payment_failure before update on public.bookings
   for each row execute function public.fixture_reject_payment();
   set request.jwt.claim.sub='${admin}'; set role authenticated`);
  await fail(rpc('99999999-9999-4999-8999-999999999999',other,'1000','card','0'),'23514');
  await db.exec('reset role; drop trigger fixture_payment_failure on public.bookings; drop function public.fixture_reject_payment()');
  check((await db.query("select count(*)::int as n from public.booking_payments where id='99999999-9999-4999-8999-999999999999'")).rows[0].n,0);
  check((await db.query("select count(*)::int as n from public.audit_log where entity='booking_payments' and entity_id='99999999-9999-4999-8999-999999999999'")).rows[0].n,0);
  check((await db.query(`select paid from public.bookings where id='${other}'`)).rows[0].paid,'0.00');
  await fail(`update public.booking_payments set actor_name='Fake' where id='${request}'`,'42501');
  await fail(`delete from public.booking_payments where id='${request}'`,'42501');
  await db.exec(`update public.profiles set active=false where id='${driver}'; set request.jwt.claim.sub='${driver}'; set role authenticated`);
  check((await db.query('select count(*)::int as n from public.booking_payments')).rows[0].n,0);
  await fail(rpc(),'42501');
  console.log('Native PostgreSQL assertions passed',assertions);
 }finally{await db.close();}
});
