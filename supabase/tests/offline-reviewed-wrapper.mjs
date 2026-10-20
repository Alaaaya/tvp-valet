/** Isolated PostgreSQL semantics/RLS test for clear_booking_customer_call. Does not connect to live data.
 * TVP_PGLITE_MODULE=/tmp/tvp-dbtest/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/booking-customer-call-clear.mjs
 */
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.TVP_PGLITE_MODULE || '/home/kit/tvp-staff/node_modules/@electric-sql/pglite/dist/index.js');
const db=new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);
 alter table storage.objects enable row level security; grant usage on schema storage to anon,authenticated,service_role;
 grant all on storage.objects to anon,authenticated,service_role;`);
const dir=new URL('../migrations/',import.meta.url);
const names=(await readdir(dir)).filter(n=>n.endsWith('.sql')).sort();
assert.ok(names.includes('20261020070000_booking_customer_call_clear.sql'));
for(const name of names){
 if(name==='20261020210000_offline_sync.sql'||name==='20261020070000_booking_customer_call_removals.sql'||name==='20261020120000_staff_accounts.sql')continue;
 if(name==='20261017170000_booking_handovers.sql')await db.exec("alter table storage.objects add column metadata jsonb");
 await db.exec(await readFile(new URL(name,dir),'utf8'));
}

const {createHash}=await import('node:crypto');
const wrapper=await readFile('/home/kit/tmp/tvp-offline-proof/reviewed-apply.sql','utf8');
assert(wrapper.includes('protect_linked_gallery_storage'));
const migration=await readFile(new URL('20261020210000_offline_sync.sql',dir),'utf8');
assert(wrapper.includes(createHash('sha256').update(migration).digest('hex')),'Wrapper hash does not match latest server migration');
await db.exec("insert into public.bookings(customer_name,arrival_at,departure_at,total) values('Dry wrapper seed','2026-10-17','2026-10-30',100)");
const tables=(await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows;
async function baseline(){
 const out={};
 for(const {tablename} of tables){
  assert(/^[a-z_]+$/.test(tablename));
  out[tablename]=(await db.query(`select count(*) n,md5(coalesce(string_agg((to_jsonb(t)-'sync_version')::text,'' order by (to_jsonb(t)-'sync_version')::text),'')) h from public."${tablename}" t`)).rows[0];
 }
 return out;
}
const before=await baseline();
await db.exec(wrapper);
assert.deepEqual(await baseline(),before);
assert.equal((await db.query('select count(*)::int n from public.booking_sync_receipts')).rows[0].n,0);
assert.equal((await db.query('select count(*)::int n from public.booking_gallery_media')).rows[0].n,0);
assert.equal((await db.query('select count(*)::int n from public.bookings where sync_version<>0')).rows[0].n,0);
console.log(JSON.stringify({passed:true,exactWrapper:true,sourceHash:createHash('sha256').update(migration).digest('hex'),tablesChecked:tables.length,seededBookings:1,newLedgerRows:0,liveWrites:0}));
await db.close();
