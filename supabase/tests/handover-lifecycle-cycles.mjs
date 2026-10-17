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
await db.exec(await readFile(new URL('../migrations/20261017180000_booking_handover_undo.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../migrations/20261017190000_handover_lifecycle_cycles.sql',import.meta.url),'utf8'));
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
const call=async(request=req,booking=b.id,action='in',details={},files=[],snapshot=undefined)=>{
 const current=snapshot ?? (await db.query('select checked_in_at,checked_out_at from public.bookings where id=$1',[booking])).rows[0] ?? {};
 const revision=(await db.query('select max(occurred_at) as revision from public.booking_handover_undos where booking_id=$1',[booking])).rows[0].revision;
 return db.query('select * from public.complete_booking_handover($1,$2,$3,$4::jsonb,$5::jsonb,$6::timestamptz,$7::timestamptz,$8::timestamptz)',
 [request,booking,action,JSON.stringify(details),JSON.stringify(files),current.checked_in_at??null,current.checked_out_at??null,snapshot && Object.hasOwn(snapshot,'revision')?snapshot.revision:revision]);
};
await db.query("insert into storage.objects(bucket_id,name,metadata) values('booking-media',$1,$2)",[path,{size:123,mimetype:'IMAGE/JPEG; codecs=binary'}]);
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
 for(const sql of [`delete from public.${table}`,`update public.${table} set booking_id=$1`,table==='booking_media'?"insert into public.booking_media(id) values($1)":"insert into public.booking_handovers(id) values($1)"])
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

// Undo lifecycle, retained evidence, immutable receipts, optimistic concurrency.
const undo=(r,booking,action,stamp)=>db.query(
 'select * from public.undo_booking_handover($1,$2,$3,$4::timestamptz)',[r,booking,action,stamp]);
await user(actor);
const undoOut=uuid(), undoIn=uuid();
await failure(()=>undo(uuid(),b.id,'in',first.checked_in_at),'23514');
for(const args of [[null,b.id,'out',out.checked_out_at],[uuid(),b.id,'bad',out.checked_out_at],
 [uuid(),b.id,'out',null],[uuid(),b.id,'out','infinity']])
 await failure(()=>undo(...args),'22023');
await failure(()=>undo(uuid(),uuid(),'out',out.checked_out_at),'P0002');
await failure(()=>undo(uuid(),b.id,'out',first.checked_in_at),'40001');
const reopened=(await undo(undoOut,b.id,'out',out.checked_out_at)).rows[0];
assert.equal(reopened.checked_out_at,null);assert.deepEqual(reopened.checked_in_at,first.checked_in_at);checks+=2;
assert.deepEqual((await undo(undoOut,b.id,'out',out.checked_out_at)).rows[0],reopened);checks++;
await failure(()=>undo(undoOut,b2.id,'out',out.checked_out_at),'23514');
await failure(()=>undo(undoOut,b.id,'in',out.checked_out_at),'23514');
await failure(()=>undo(undoOut,b.id,'out',first.checked_in_at),'23514');
await failure(()=>undo(uuid(),b.id,'out',out.checked_out_at),'40001');
await failure(()=>call(outRequest,b.id,'out'),'40001');
const expected=(await undo(undoIn,b.id,'in',first.checked_in_at)).rows[0];
assert.equal(expected.checked_in_at,null);assert.equal(expected.checked_out_at,null);
assert.equal(expected.status,'confirmed');assert.equal(expected.comment,first.comment);checks+=4;
await failure(()=>call(req,b.id,'in'),'40001');
// Photos, signatures, storage objects and all historical receipts survive undo.
assert.equal((await db.query('select count(*)::int n from public.booking_media where booking_id=$1',[b.id])).rows[0].n,1);checks++;
assert.equal((await db.query("select count(*)::int n from storage.objects where name=$1",[path])).rows[0].n,1);checks++;
const history=(await db.query('select * from public.booking_handovers where booking_id=$1',[b.id])).rows;
assert.equal(history.length,2);assert.ok(history.every(h=>h.undone_at && h.undone_by===actor));checks+=2;
const receipts=(await db.query('select * from public.booking_handover_undos where booking_id=$1',[b.id])).rows;
assert.equal(receipts.length,2);assert.ok(receipts.every(r=>r.actor_id===actor && r.occurred_at));checks+=2;
const inReceipt=receipts.find(r=>r.action==='in');
assert.ok(inReceipt.old_data.checked_in_at);assert.equal(inReceipt.new_data.checked_in_at,null);checks+=2;
for(const sql of ['update public.booking_handover_undos set actor_id=$1',
 'delete from public.booking_handover_undos',
 'insert into public.booking_handover_undos(id) values($1)'])
 await failure(()=>db.query(sql,sql.includes('$1')?[uuid()]:[]),'42501');
await failure(()=>db.query("select public.undo_booking_handover($1,$2,'in',$3,$4)",[uuid(),b.id,first.checked_in_at,outsider]),'42883');
// New completion request after undo succeeds; stale completion request cannot resurrect.
const newIn=(await call(uuid(),b.id,'in')).rows[0];
const newOut=(await call(uuid(),b.id,'out')).rows[0];
await failure(()=>undo(uuid(),b.id,'out',out.checked_out_at),'40001');
await failure(()=>call(req,b.id,'in'),'40001');
assert.deepEqual((await undo(undoOut,b.id,'out',out.checked_out_at)).rows[0],newOut);checks++;
await undo(uuid(),b.id,'out',newOut.checked_out_at);
await undo(uuid(),b.id,'in',newIn.checked_in_at);
// Legacy records without handover rows also support audited undo.
await db.exec('reset role');
const legacy=await makeBooking();
await user(actor);
const legacyIn=(await db.query("select * from public.check_booking($1,'in')",[legacy.id])).rows[0];
await undo(uuid(),legacy.id,'in',legacyIn.checked_in_at);checks++;
await user('', 'anon');await failure(()=>undo(uuid(),b.id,'in',first.checked_in_at),'42501');
await failure(()=>db.query('select * from public.booking_handover_undos'),'42501');
await user(outsider);await failure(()=>undo(uuid(),b.id,'in',first.checked_in_at),'42501');
assert.equal((await db.query('select * from public.booking_handover_undos')).rows.length,0);checks++;
await db.exec('reset role');await db.query('update public.profiles set active=false where id=$1',[actor]);
await user(actor);await failure(()=>undo(undoOut,b.id,'out',out.checked_out_at),'42501');
assert.equal((await db.query('select * from public.booking_handover_undos')).rows.length,0);checks++;
await db.exec('reset role');
await db.query("update public.profiles set active=true,role='admin' where id=$1",[actor]);
await user(actor);
assert.ok((await db.query("select * from public.audit_log where entity='booking_handover_undos' and actor_id=$1",[actor])).rows.length>=5);checks++;
const adminIn=(await call(uuid(),legacy.id,'in')).rows[0];
await undo(uuid(),legacy.id,'in',adminIn.checked_in_at);checks++;
// Signature evidence remains linked to its original, now-undone handover.
const manyStamp=(await db.query('select checked_in_at from public.bookings where id=$1',[many.id])).rows[0].checked_in_at;
await undo(uuid(),many.id,'in',manyStamp);
assert.equal((await db.query('select count(*)::int n from public.booking_media where booking_id=$1',[many.id])).rows[0].n,41);checks++;
assert.equal((await db.query("select count(*)::int n from public.booking_media where booking_id=$1 and kind='signature'",[many.id])).rows[0].n,1);checks++;
await failure(()=>undo(uuid(),cancelled.id,'in',first.checked_in_at),'23514');
await user('');
await failure(()=>undo(uuid(),b.id,'in',first.checked_in_at),'42501');
await db.exec('reset role');
await db.query("insert into public.profiles(id,full_name,role) values($1,'Other driver','driver')",[outsider]);
await user(outsider);
await failure(()=>undo(undoOut,b.id,'out',out.checked_out_at),'23514');
await user(actor);
const udf=(await db.query("select prosecdef,proconfig,pronargs from pg_proc where proname='undo_booking_handover'")).rows[0];
assert.equal(udf.prosecdef,true);assert.deepEqual(udf.proconfig,['search_path=""']);assert.equal(udf.pronargs,4);checks+=3;
await db.exec('reset role');
await failure(()=>db.query('delete from public.booking_handover_undos'),'42501');
await failure(()=>db.query('update public.booking_handover_undos set actor_id=$1',[outsider]),'42501');

// New snapshot-bound completion rejects obsolete checkout drafts after undo/recheck.
await user(actor);
const cycle=await makeBooking();
// makeBooking above is admin-authorized because actor is now admin.
const ci=(await call(uuid(),cycle.id,'in')).rows[0];
const staleSnapshot={checked_in_at:ci.checked_in_at,checked_out_at:null};
const op=async(action)=>(await db.query('select * from public.record_booking_operation($1,$2)',[cycle.id,action])).rows[0];
for(const action of ['taken_away','retrieved','customer_called','ride_started']) await op(action);
const opsBefore=(await db.query('select * from public.booking_operations where booking_id=$1',[cycle.id])).rows[0];
const co=(await call(uuid(),cycle.id,'out')).rows[0];
await undo(uuid(),cycle.id,'out',co.checked_out_at);
assert.deepEqual((await db.query('select * from public.booking_operations where booking_id=$1',[cycle.id])).rows[0],opsBefore);checks++;
await undo(uuid(),cycle.id,'in',ci.checked_in_at);
const reset=(await db.query('select * from public.booking_operations where booking_id=$1',[cycle.id])).rows[0];
for(const key of ['taken_away_at','retrieved_at','customer_called_at','ride_started_at']) {assert.equal(reset[key],null);checks++;}
const oldEvents=(await db.query('select * from public.booking_operation_events where booking_id=$1',[cycle.id])).rows;
assert.equal(oldEvents.length,4);assert.ok(oldEvents.every(e=>e.undone_at&&e.undone_by===actor));checks+=2;
await failure(()=>op('taken_away'),'23514');
const ci2=(await call(uuid(),cycle.id,'in')).rows[0];
const rejectedRequest=uuid();
await failure(()=>call(rejectedRequest,cycle.id,'out',{comment:'STALE DRAFT'},[],staleSnapshot),'40001');
assert.equal((await db.query('select * from public.booking_handovers where id=$1',[rejectedRequest])).rows.length,0);checks++;
assert.ok(!(await db.query('select comment from public.bookings where id=$1',[cycle.id])).rows[0].comment.includes('STALE DRAFT'));checks++;
await failure(()=>call(uuid(),cycle.id,'out',{},[],{checked_in_at:null,checked_out_at:null}),'40001');
await failure(()=>call(uuid(),cycle.id,'out',{},[],{checked_in_at:ci2.checked_in_at,checked_out_at:ci2.checked_in_at}),'40001');
await failure(()=>call(uuid(),cycle.id,'out',{},[],{checked_in_at:'infinity'}),'22023');
for(const action of ['taken_away','retrieved','customer_called','ride_started']) await op(action);
const events=(await db.query('select * from public.booking_operation_events where booking_id=$1',[cycle.id])).rows;
assert.equal(events.length,8);assert.equal(events.filter(e=>e.undone_at===null).length,4);checks+=2;
const co2Req=uuid();
const co2=(await call(co2Req,cycle.id,'out',{},[],{checked_in_at:ci2.checked_in_at,checked_out_at:null})).rows[0];
// Active receipt retries may carry stale snapshots, but never reapply mutable details.
assert.deepEqual((await call(co2Req,cycle.id,'out',null,null,staleSnapshot)).rows[0],co2);checks++;
await failure(()=>db.query("select public.complete_booking_handover($1,$2,'in','{}','[]')",[uuid(),cycle.id]),'42883');
await failure(()=>db.query("select private.complete_booking_handover_core($1,$2,'in','{}','[]')",[uuid(),cycle.id]),'42501');
await db.query("select set_config('tvp.trusted_lifecycle','true',false)");
await failure(()=>db.query('update public.bookings set checked_out_at=null where id=$1',[cycle.id]),'42501');
assert.ok((await db.query("select * from public.audit_log where entity='booking_operations' and entity_id=$1 and old_data->>'taken_away_at' is not null and new_data->>'taken_away_at' is null and actor_id=$2",[opsBefore.id,actor])).rows.length>=1);checks++;
await failure(()=>db.query('update public.bookings set checked_in_at=$2 where id=$1',[cycle.id,ci.checked_in_at]),'42501');
await db.query("update public.bookings set comment='Ordinary admin edit' where id=$1",[cycle.id]);checks++;
// Direct admin upsert cannot resurrect undo timestamps; RPCs still succeed.
await undo(uuid(),cycle.id,'out',co2.checked_out_at);
await undo(uuid(),cycle.id,'in',ci2.checked_in_at);
await failure(()=>db.query("insert into public.bookings(id,customer_name,arrival_at,departure_at,checked_in_at) values($1,'Stale',now(),now(),$2) on conflict(id) do update set checked_in_at=excluded.checked_in_at",[cycle.id,ci2.checked_in_at]),'42501');
await call(uuid(),cycle.id,'in');checks++;
await user('', 'anon');
await failure(()=>db.query("select public.complete_booking_handover($1,$2,'in','{}','[]',null,null,null)",[uuid(),cycle.id]),'42501');
await user(outsider);
await failure(()=>call(uuid(),cycle.id,'out',{},[],staleSnapshot),'40001');
await db.exec('reset role');
await db.query('update public.profiles set active=false where id=$1',[outsider]);
await user(outsider);await failure(()=>call(uuid(),cycle.id,'out'),'42501');
await db.exec('reset role');

// ABA null/null draft must fail even when both lifecycle timestamps match again.
await user(actor);
const aba=await makeBooking();
const beforeABA={checked_in_at:null,checked_out_at:null,revision:null};
const abaIn=(await call(uuid(),aba.id,'in',{},[],beforeABA)).rows[0];
await undo(uuid(),aba.id,'in',abaIn.checked_in_at);
await failure(()=>call(uuid(),aba.id,'in',{},[],beforeABA),'40001');
const latestRevision=(await db.query('select max(occurred_at) as revision from public.booking_handover_undos where booking_id=$1',[aba.id])).rows[0].revision;
const abaRequest=uuid();
const abaRecheck=(await call(abaRequest,aba.id,'in',{},[],{...beforeABA,revision:latestRevision})).rows[0];checks++;
assert.deepEqual((await call(abaRequest,aba.id,'in',null,null,beforeABA)).rows[0],abaRecheck);checks++;
await failure(()=>call(uuid(),aba.id,'out',{},[],{checked_in_at:abaRecheck.checked_in_at,revision:null}),'40001');
await failure(()=>call(uuid(),aba.id,'out',{},[],{checked_in_at:abaRecheck.checked_in_at,revision:'infinity'}),'22023');
await undo(uuid(),aba.id,'in',abaRecheck.checked_in_at);
await failure(()=>call(abaRequest,aba.id,'in',{},[],beforeABA),'40001');
await failure(()=>call(uuid(),aba.id,'in',{},[],{...beforeABA,revision:latestRevision}),'40001');
await failure(()=>db.query("insert into public.bookings(customer_name,arrival_at,departure_at,checked_in_at) values('Spoofed',now(),now(),now())"),'42501');
await db.query("insert into public.bookings(customer_name,arrival_at,departure_at) values('Ordinary insert',now(),now())");checks++;
await failure(()=>db.query("select public.complete_booking_handover($1,$2,'in','{}','[]',null,null)",[uuid(),aba.id]),'42883');
console.log(JSON.stringify({status:'passed',checks,isolated:true,liveBookingWrites:0}));
await db.close();
