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
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text, metadata jsonb);
 alter table storage.objects enable row level security; grant usage on schema storage to anon,authenticated,service_role;
 grant all on storage.objects to anon,authenticated,service_role;`);
await db.exec(await readFile(new URL('../migrations/20261017090000_valet_backend.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../migrations/20261017100000_booking_operational_actions.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../migrations/20261017130000_retrieved_operation.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../migrations/20261017170000_booking_handovers.sql',import.meta.url),'utf8'));
const actor='00000000-0000-4000-8000-000000000001', outsider='00000000-0000-4000-8000-000000000002';
await db.query('insert into auth.users(id) values($1),($2)',[actor,outsider]);
await db.query("insert into public.profiles(id,full_name,role) values($1,'Driver','driver')",[actor]);
const makeBooking=async(status='confirmed')=>(await db.query("insert into public.bookings(customer_name,arrival_at,departure_at,status,comment,km,flight_in,flight_out) values('Isolated','2026-10-17Z','2026-10-20Z',$1,'Imported metadata',123,'IN1','OUT1') returning *",[status])).rows[0];
async function user(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);}
const uuid=()=>crypto.randomUUID();
let checks=0;
async function failure(fn,code){await assert.rejects(fn,e=>{if(code)assert.equal(e.code,code);return true;});checks++;}
const b=await makeBooking(), b2=await makeBooking(), cancelled=await makeBooking('cancelled');
const req=uuid(), mediaId=uuid(), path=b.id+'/'+req+'-'+mediaId+'.jpg';
const media={id:mediaId,path,kind:'photo',mime_type:'image/jpeg',size_bytes:123,captured_at:new Date().toISOString()};
const call=(request=req,booking=b.id,action='in',details={},files=[])=>db.query('select * from public.complete_booking_handover($1,$2,$3,$4::jsonb,$5::jsonb)',[request,booking,action,JSON.stringify(details),JSON.stringify(files)]);
await db.query("insert into storage.objects(bucket_id,name,metadata) values('booking-media',$1,$2)",[path,{size:123,mimetype:'image/jpeg; charset=binary'}]);
await user(actor);
for(const details of [null,[],{total:0},{km:-1},{km:1.1},{km:2147483648},{km:'1'},{poor_visibility:null},{key_cash:null},{flight_number:'a'.repeat(41)},{comment:'a'.repeat(10001)},{key_cash:'a'.repeat(201)}]){
 await failure(()=>call(req,b.id,'in',details),'22023');
}
await failure(()=>call(req,b.id,'bad'),'22023');
await failure(()=>call(req,b.id,'in',{},null),'22023');
for(const patch of [
 {kind:'document'},{mime_type:'application/pdf'},{kind:'signature',mime_type:'image/jpeg'},
 {size_bytes:0},{size_bytes:1.5},{size_bytes:10485761},{captured_at:'infinity'},
 {captured_at:'2026-10-17'},{captured_at:'2999-01-01T00:00:00Z'},
 {path:b2.id+'/'+req+'-'+mediaId+'.jpg'}, {path:path+'/x'}, {path:b.id+'/../'+mediaId+'.jpg'},
 {extra:true},{size_bytes:'123'}
]) await failure(()=>call(req,b.id,'in',{},[{...media,...patch}]),'22023');
await failure(()=>call(req,b.id,'in',{},[{...media,size_bytes:124}]),'23514');
await failure(()=>call(req,b.id,'in',{},[{...media,mime_type:'image/png'}]),'23514');
await failure(()=>call(req,b.id,'in',{},[{...media,path:b.id+'/'+req+'-'+mediaId+'.png'}]),'23514');
await failure(()=>call(req,b.id,'in',{},Array(42).fill(media)),'22023');
await failure(()=>call(req,b.id,'in',{},[media,media]),'23505');
assert.equal((await db.query('select count(*)::int as n from public.booking_handovers')).rows[0].n,0);checks++;
assert.equal((await db.query('select count(*)::int as n from public.booking_media')).rows[0].n,0);checks++;
assert.equal((await db.query('select checked_in_at from public.bookings where id=$1',[b.id])).rows[0].checked_in_at,null);checks++;
const first=(await call(req,b.id,'in',{km:456,key_cash:'10 Driver',flight_number:'NEWIN',comment:'New remark',poor_visibility:true},[media])).rows[0];
assert.ok(first.checked_in_at);assert.equal(first.km,456);assert.equal(first.key_cash,'10 Driver');assert.equal(first.flight_in,'NEWIN');assert.equal(first.flight_out,'OUT1');assert.equal(first.comment,'Imported metadata\nNew remark');checks+=6;
// Replay must not inspect an invalid mutable draft or insert duplicate media/comments.
assert.deepEqual((await call(req,b.id,'in',null,null)).rows[0],first);checks++;
await failure(()=>call(req,b2.id,'in'),'23514');
await failure(()=>call(req,b.id,'out'),'23514');
await failure(()=>call(uuid(),b.id,'in'),'23514');
for(const table of ['booking_media','booking_handovers']){
 for(const sql of [`delete from public.${table}`,`update public.${table} set booking_id=$1`,table==='booking_media'?"insert into public.booking_media(id) values($1)":"insert into public.booking_handovers(request_id) values($1)"])
  await failure(()=>db.query(sql,sql.includes('$1')?[uuid()]:[]),'42501');
 assert.equal((await db.query('select count(*)::int as n from public.'+table)).rows[0].n,1);checks++;
}
await failure(()=>call(uuid(),b2.id,'out',{comment:'Must roll back'}),'23514');
assert.equal((await db.query('select comment from public.bookings where id=$1',[b2.id])).rows[0].comment,'Imported metadata');checks++;
await failure(()=>call(uuid(),cancelled.id,'in',{km:99}),'23514');
const outRequest=uuid();
const out=(await call(outRequest,b.id,'out',{km:null,flight_number:'NEWOUT',comment:''})).rows[0];
assert.ok(out.checked_out_at);assert.equal(out.km,null);assert.equal(out.flight_in,'NEWIN');assert.equal(out.flight_out,'NEWOUT');assert.equal(out.comment,first.comment);checks+=5;
assert.deepEqual((await call(req,b.id,'in',[],null)).rows[0],out);checks++;
await user('', 'anon');await failure(()=>call(),'42501');
for(const table of ['booking_media','booking_handovers'])await failure(()=>db.query('select * from public.'+table),'42501');
await user(outsider);await failure(()=>call(),'42501');
for(const table of ['booking_media','booking_handovers']){assert.equal((await db.query('select * from public.'+table)).rows.length,0);checks++;}
await db.exec('reset role');await db.query('update public.profiles set active=false where id=$1',[actor]);
await user(actor);await failure(()=>call(),'42501');
await db.exec('reset role');await db.query('update public.profiles set active=true where id=$1',[actor]);
// Ensure 40 photos + optional signature work, 41 photos / 2 signatures fail and roll back.
const many=await makeBooking(), manyReq=uuid();
const files=Array.from({length:41},(_,i)=>{const id=uuid();return {id,path:many.id+'/'+manyReq+'-'+id+'.png',kind:i===40?'signature':'photo',mime_type:'image/png',size_bytes:1,captured_at:new Date().toISOString()};});
for(const f of files)await db.query("insert into storage.objects(bucket_id,name,metadata) values('booking-media',$1,$2)",[f.path,{size:1,mimetype:'image/png'}]);
await user(actor);
await failure(()=>call(manyReq,many.id,'in',{},files.map(f=>({...f,kind:'photo'}))),'22023');
await failure(()=>call(manyReq,many.id,'in',{},files.map((f,i)=>({...f,kind:i>38?'signature':'photo'}))),'22023');
await call(manyReq,many.id,'in',{},files);checks++;
// All video allowlisted types, private object metadata checks and maximum size.
await db.exec('reset role');
for(const mime of ['video/mp4','video/webm','video/quicktime']){
 const videoBooking=await makeBooking(), r=uuid(), id=uuid();
 const file={id,path:videoBooking.id+'/'+r+'-'+id+'.mp4',kind:'video',mime_type:mime,size_bytes:52428800,captured_at:new Date().toISOString()};
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('booking-media',$1,$2)",[file.path,{size:52428800,mimetype:mime}]);
 await user(actor);await failure(()=>call(r,videoBooking.id,'in',{},[{...file,size_bytes:52428801}]),'22023');
 await call(r,videoBooking.id,'in',{},[file]);checks++;await db.exec('reset role');
}
const bucket=(await db.query("select * from storage.buckets where id='booking-media'")).rows[0];
assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),52428800);assert.ok(bucket.allowed_mime_types.includes('application/pdf'));checks+=3;
const fn=(await db.query("select prosecdef,proconfig from pg_proc where proname='complete_booking_handover'")).rows[0];
assert.equal(fn.prosecdef,true);assert.deepEqual(fn.proconfig,['search_path=""']);checks+=2;
await user('', 'service_role');await db.query('delete from public.booking_media where booking_id=$1',[b.id]);checks++;
console.log(JSON.stringify({status:'passed',checks,isolated:true,liveBookingWrites:0}));
await db.close();
