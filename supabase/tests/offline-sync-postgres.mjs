/** Real multi-session PostgreSQL test. Explicit isolated localhost database only. */
import {readFile,readdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const run=promisify(execFile);
const url=process.env.TVP_OFFLINE_TEST_DATABASE_URL;
if(!url)throw Error('Set TVP_OFFLINE_TEST_DATABASE_URL to an EMPTY disposable localhost DB named tvp_offline_test');
const u=new URL(url);
if(!['127.0.0.1','localhost'].includes(u.hostname)||u.pathname!='/tvp_offline_test')throw Error('Refusing non-isolated DB');
const sql=async query=>(await run('psql',[url,'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',query],{maxBuffer:1024*1024})).stdout.trim();
const source=await readFile(new URL('./offline-sync.mjs',import.meta.url),'utf8');
const setup=source.split('await db.exec(`')[1].split('`);')[0];
await sql(setup);
const dir=new URL('../migrations/',import.meta.url);
for(const name of (await readdir(dir)).filter(x=>x.endsWith('.sql')).sort()){
 if(name==='20261020070000_booking_customer_call_removals.sql'||name==='20261020120000_staff_accounts.sql')continue;
 if(name==='20261017170000_booking_handovers.sql')await sql('alter table storage.objects add column metadata jsonb');
 await sql(await readFile(new URL(name,dir),'utf8'));
}
const driver=randomUUID(),b=randomUUID(),c=randomUUID();
await sql(`insert into auth.users(id) values('${driver}');insert into public.profiles(id,full_name,role) values('${driver}','Driver','driver');
insert into public.bookings(id,customer_name,arrival_at,departure_at,total) values('${b}','Race1','2026-10-17','2026-10-30',100),('${c}','Race2','2026-10-17','2026-10-30',100)`);
const query=(booking,event)=>`set role authenticated;set request.jwt.claim.sub='${driver}';
select public.sync_booking_event('${event}','${booking}',0,'payment','{"amount_cents":1000,"method":"cash","expected_paid_cents":0,"expected_total_cents":10000}');`;
const event=randomUUID();
const same=await Promise.all([sql('begin;'+query(b,event)+'select pg_sleep(0.4);commit;'),sql(query(b,event))]);
assert.equal(JSON.parse(same[0].split('\n').find(x=>x.startsWith('{'))).event_id,event);
assert.equal(JSON.parse(same[1]).event_id,event);
assert.equal(await sql(`select count(*) from public.booking_payments where booking_id='${b}'`),'1');
assert.equal(await sql(`select paid from public.bookings where id='${b}'`),'10.00');
const different=await Promise.allSettled([sql('begin;'+query(c,randomUUID())+'select pg_sleep(0.4);commit;'),sql(query(c,randomUUID()))]);
assert.equal(different.filter(x=>x.status==='fulfilled').length,1);
assert.equal(different.filter(x=>x.status==='rejected'&&x.reason.stderr.includes('Booking changed; review before retry')).length,1);
assert.equal(await sql(`select count(*) from public.booking_payments where booking_id='${c}'`),'1');
assert.equal(await sql('select count(*) from public.booking_sync_receipts'),'2');
console.log(JSON.stringify({status:'passed',checks:8,isolated:true,realMultiSession:true,liveWrites:0}));
