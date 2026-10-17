/**
 * PostgreSQL integration tests via PGlite. Uses a minimal Supabase auth/storage
 * fixture, not the hosted Storage/Auth services. No network or production data.
 * npm install --prefix /tmp/tvp-dbtest @electric-sql/pglite
 * TVP_PGLITE_MODULE=/tmp/tvp-dbtest/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/run.mjs
 */
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const { PGlite } = await import(process.env.TVP_PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key,email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to anon,authenticated,service_role;
  grant execute on function auth.uid() to anon,authenticated,service_role;
  create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon,authenticated,service_role;
  grant all on storage.objects to anon,authenticated,service_role;
`)
await db.exec(await readFile(new URL('../migrations/20261017090000_valet_backend.sql',import.meta.url),'utf8'))
let count = 0
const ids = {
 admin:'00000000-0000-4000-8000-000000000001',
 driver:'00000000-0000-4000-8000-000000000002',
 stranger:'00000000-0000-4000-8000-000000000003',
 second:'00000000-0000-4000-8000-000000000004',
}
async function user(id,role='authenticated') {
 await db.exec('reset role')
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id || ''])
 await db.exec('set role '+role)
}
async function ok(sql,params=[]) { count++; return (await db.query(sql,params)).rows }
async function fails(sql,code,params=[]) {
 count++
 await assert.rejects(db.query(sql,params),e => {
   assert.equal(e.code,code,e.message); return true
 })
}
await db.exec(`insert into auth.users(id) values ${Object.values(ids).map(id=>"('"+id+"')").join(',')}`)
await db.query("insert into public.profiles(id,full_name,role) values($1,'Admin','admin'),($2,'Driver','driver')",[ids.admin,ids.driver])
await user(ids.admin)
const booking = (await ok(`insert into public.bookings(customer_name,arrival_at,departure_at,total)
 values('Test Customer','2026-10-17T07:00:00Z','2026-10-19T09:00:00Z',50) returning *`))[0]
await fails("select public.manage_employee($1,'Admin','driver',true)",'23514',[ids.admin])
await fails("select public.manage_employee($1,'Admin','admin',false)",'23514',[ids.admin])
await ok("select public.manage_employee($1,'Second Admin','admin',true)",[ids.second])
await ok("select public.manage_employee($1,'Second Admin','driver',true)",[ids.second])

await ok("select public.set_employee_role($1,'admin')",[ids.second])
await ok("select public.set_employee_role($1,'driver')",[ids.second])
await fails("select public.set_employee_role($1,'driver')",'23514',[ids.admin])
await fails("select public.set_employee_role($1,'owner')",'22023',[ids.second])
await fails("select public.set_employee_role('10000000-0000-4000-8000-000000000000','driver')",'P0002')
const profile=(await ok('select * from public.profiles where id=$1',[ids.admin]))[0]
assert.equal(profile.full_name,'Admin')
assert.equal(profile.role,'admin')
assert.ok('email' in profile)
await db.exec('reset role')
await ok("update auth.users set email='driver@example.test' where id=$1",[ids.driver])
await user(ids.admin)
assert.equal((await ok('select email from public.profiles where id=$1',[ids.driver]))[0].email,'driver@example.test')
await user(ids.driver)
await fails("select public.set_employee_role($1,'admin')",'42501',[ids.driver])
assert.equal((await ok('select * from public.bookings')).length,1)
assert.equal((await ok('update public.bookings set total=1 where id=$1 returning *',[booking.id])).length,0)
assert.equal((await ok('delete from public.bookings where id=$1 returning *',[booking.id])).length,0)
await fails("insert into public.bookings(customer_name,arrival_at,departure_at) values('X',now(),now())",'42501')
await fails("update public.profiles set role='admin' where id=$1",'42501',[ids.driver])
await fails("select public.manage_employee($1,'Driver','admin',true)",'42501',[ids.driver])
await fails("select public.import_bookings('[]')",'42501')
await fails("select public.update_booking_ops($1,'{\"total\":0}')",'22023',[booking.id])
await fails("select public.update_booking_ops($1,'{\"checked_in_at\":null}')",'22023',[booking.id])
await fails("select public.update_booking_ops($1,'{\"spot\":{\"x\":1}}')",'22023',[booking.id])
await fails("select public.update_booking_ops($1,'{\"km\":-1}')",'23514',[booking.id])
await fails("select public.update_booking_ops($1,jsonb_build_object('driver_id',$2::text))",'23514',[booking.id,ids.stranger])
const patched = (await ok("select (public.update_booking_ops($1,'{\"key_cash\":\"10€ Wael\",\"spot\":\"A12\",\"km\":1250}')).*",[booking.id]))[0]
assert.equal(patched.total,'50.00')
assert.equal(patched.spot,'A12')
await fails("select public.check_booking($1,'out')",'23514',[booking.id])
await fails("select public.check_booking($1,null)",'22023',[booking.id])
await fails("select public.check_booking('10000000-0000-4000-8000-000000000000','in')",'P0002')
await ok("select public.check_booking($1,'in')",[booking.id])
await fails("select public.check_booking($1,'in')",'23514',[booking.id])
await ok("select public.check_booking($1,'out')",[booking.id])
await fails("select public.check_booking($1,'out')",'23514',[booking.id])
assert.equal((await ok('select * from public.audit_log')).length,0)
assert.equal((await ok('select * from public.import_log')).length,0)
await ok("insert into storage.objects(bucket_id,name) values('booking-media',$1)",[booking.id+'/test.jpg'])
await fails("insert into storage.objects(bucket_id,name) values('booking-media','10000000-0000-4000-8000-000000000000/test.jpg')",'42501')
await fails("insert into storage.objects(bucket_id,name) values('booking-media',$1)",'42501',[booking.id+'/../bad.jpg'])
assert.equal((await ok("update storage.objects set name=$1 where bucket_id='booking-media' returning *",[booking.id+'/overwritten.jpg'])).length,0)
assert.equal((await ok("delete from storage.objects where bucket_id='booking-media' returning *")).length,0)
await fails("delete from public.audit_log",'42501')

await user(ids.stranger)
assert.equal((await ok('select * from public.bookings')).length,0)
assert.equal((await ok('select * from public.profiles')).length,0)
assert.equal((await ok("select * from storage.objects where bucket_id='booking-media'")).length,0)
await fails("select public.check_booking($1,'in')",'42501',[booking.id])
await fails("select public.update_booking_ops($1,'{}')",'42501',[booking.id])

await user(ids.admin)
await ok("select public.manage_employee($1,'Driver','driver',false)",[ids.driver])
await user(ids.driver)
assert.equal((await ok('select * from public.bookings')).length,0)
await fails("select public.update_booking_ops($1,'{}')",'42501',[booking.id])
await user(ids.admin)
await ok("select public.manage_employee($1,'Driver','driver',true)",[ids.driver])

const row = {external_id:'EXT-1',platform:' Allopark ',customer_name:'Import Test',arrival_at:'2026-10-17T09:00:00+02:00',departure_at:'2026-10-20T09:00:00+02:00',total:80}
const batch = [row,{...row,platform:'allopark'}, {...row,external_id:'BAD-1',total:-10},
 {...row,external_id:'BAD-2',total:'90'}, {...row,external_id:'BAD-3',arrival_at:'2026-10-17T09:00:00'},
 {...row,external_id:'BAD-4',driver_id:ids.driver}, {...row,external_id:'BAD-5',customer_name:null},
 {...row,external_id:'BAD-6',departure_at:'2026-10-16T09:00:00Z'},
 {...row,external_id:'BAD-7',product:'nonexistent'},42]
const result = (await ok("select public.import_bookings($1::jsonb) as result",[JSON.stringify(batch)]))[0].result
assert.equal(result.imported,1)
assert.equal(result.skipped,1)
assert.equal(result.errors.length,8)
const replay = (await ok("select public.import_bookings($1::jsonb) as result",[JSON.stringify([row])]))[0].result
assert.equal(replay.imported,0)
assert.equal(replay.skipped,1)
assert.equal((await ok("select * from public.bookings where external_id='EXT-1'")).length,1)
await fails("select public.import_bookings('{}')",'22023')
await fails("select public.import_bookings($1::jsonb)",'22023',[JSON.stringify(Array(1001).fill(row))])
const cancelled = (await ok(`insert into public.bookings(customer_name,arrival_at,departure_at,status)
 values('Cancelled',now(),now(),'cancelled') returning id`))[0]
await fails("select public.check_booking($1,'in')",'23514',[cancelled.id])
assert.ok((await ok('select * from public.audit_log')).length >= 10)
assert.equal((await ok('select * from public.import_log')).length,2)
await ok("update storage.objects set name=$1 where bucket_id='booking-media'",[booking.id+'/updated.jpg'])
await ok("delete from storage.objects where bucket_id='booking-media'")
await user(null,'anon')
await fails('select * from public.bookings','42501')
await fails("select public.check_booking($1,'in')",'42501',[booking.id])
await fails("select public.import_bookings('[]')",'42501')
await fails("select public.set_employee_role($1,'admin')",'42501',[ids.stranger])
await user(null)
await fails("select public.manage_employee($1,'Attacker','admin',true)",'42501',[ids.stranger])
await fails("select public.check_booking($1,'in')",'42501',[booking.id])
console.log(`Passed ${count} PostgreSQL security/behavior queries plus assertions.`)
await db.close()
