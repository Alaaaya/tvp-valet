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
 if(name==='20261020070000_booking_customer_call_removals.sql'||name==='20261020120000_staff_accounts.sql')continue;
 if(name==='20261017170000_booking_handovers.sql')await db.exec("alter table storage.objects add column metadata jsonb");
 await db.exec(await readFile(new URL(name,dir),'utf8'));
}
const {randomUUID}=await import('node:crypto');
const admin=randomUUID(),driver=randomUUID();
await db.query('insert into auth.users(id) values($1),($2)',[admin,driver]);
await db.query("insert into public.profiles(id,full_name,role) values($1,'Admin','admin'),($2,'Driver','driver')",[admin,driver]);
let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
async function user(id,role='authenticated'){
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
 await db.exec('set role '+role);
}
async function fresh(){
 await db.exec('reset role');
 return (await db.query("insert into public.bookings(customer_name,arrival_at,departure_at,total) values('Offline','2026-10-17','2026-10-30',100) returning *")).rows[0];
}
const row=async id=>(await db.query('select * from public.bookings where id=$1',[id])).rows[0];
const ops=async id=>(await db.query('select * from public.booking_operations where booking_id=$1',[id])).rows[0];
const version=async id=>Number((await row(id)).sync_version);
async function reject(fn,code){checks++;await assert.rejects(fn,e=>{assert.equal(e.code,code,e.message);return true;});}
async function sync(b,action,payload,v=Number(b.sync_version),event=randomUUID()){
 return (await db.query('select public.sync_booking_event($1,$2,$3,$4,$5::jsonb) as r',
 [event,b.id,v,action,JSON.stringify(payload)])).rows[0].r;
}
const payment={amount_cents:1000,method:'cash',expected_paid_cents:0,expected_total_cents:10000};
let b=await fresh();eq(Number(b.sync_version),0);
await user('','anon');await reject(async()=>sync(b,'payment',payment),'42501');
await user(driver);
const event=randomUUID(),first=await sync(b,'payment',payment,0,event);
eq(first.event_id,event);eq(first.booking.paid,10);assert.ok(first.version>0);checks++;
eq(await sync(b,'payment',payment,0,event),first);
eq((await row(b.id)).paid,'10.00');
await reject(async()=>sync(b,'payment',payment),'PT409');
await reject(async()=>sync(b,'payment',{...payment,amount_cents:2000},0,event),'23514');
await user(admin);await reject(async()=>sync(b,'payment',payment,0,event),'23514');
const other=await fresh();await user(driver);
await reject(async()=>sync(other,'payment',payment,0,event),'23514');
for(const [action,payload] of [
 ['arbitrary',{}],['payment',{...payment,actor_id:admin}],['payment',{...payment,request_id:event}],
 ['payment',{}],['operation',{action:'customer_called'}]
]) await reject(async()=>sync(other,action,payload),'22023');
await reject(async()=>sync(other,'payment',payment,-1),'22023');
// Failure rolls back BOTH receipt and payment.
await reject(async()=>sync(other,'payment',{...payment,amount_cents:100000}),'23514');
eq((await row(other.id)).paid,'0.00');
await db.exec('reset role');
eq((await db.query('select count(*)::int n from public.booking_sync_receipts')).rows[0].n,1);
await reject(async()=>db.query('delete from public.booking_sync_receipts'),'42501');
await reject(async()=>db.query("update public.booking_sync_receipts set action='x'"),'42501');
await user(driver);
await reject(async()=>db.query('select * from public.booking_sync_receipts'),'42501');
// Underlying driver/admin authorization is preserved.
const snap=async id=>{
 const r=await row(id);
 return {edit_revision:Number(r.edit_revision),detail_revision:Number(r.detail_revision),
 lifecycle_revision:Number((await db.query('select count(*) n from public.booking_handover_undos where booking_id=$1',[id])).rows[0].n),
 status:r.status,checked_in_at:r.checked_in_at,checked_out_at:r.checked_out_at,spot:r.spot||''};
};
await reject(async()=>sync(other,'safe_edit',{patch:{phone:'forbidden'},expected:await snap(other.id)}),'42501');
let edit=await sync(other,'safe_edit',{patch:{comment:'Offline driver'},expected:await snap(other.id)});
eq(edit.booking.comment,'Offline driver');
const callPayload={expected_called_at:null,expected_checked_out_at:null,expected_lifecycle_revision:0,allow_repeat:false};
let call=await sync(other,'customer_call',callPayload,edit.version);
assert.ok(call.operations.customer_called_at);checks++;
assert.ok(call.version>edit.version);checks++;
await reject(async()=>sync(other,'update_ops',{patch:{comment:'stale'}},edit.version),'PT409');
const clear=await sync(other,'clear_customer_call',{expected_called_at:call.operations.customer_called_at,expected_lifecycle_revision:0},call.version);
eq(clear.operations.customer_called_at,null);
let hand=await sync(other,'handover',{action:'in',details:{comment:'Checkin'},media:[],expected_in:null,expected_out:null,expected_revision:0},clear.version);
assert.ok(hand.booking.checked_in_at);checks++;
let operation=await sync(other,'operation',{action:'taken_away'},hand.version);
assert.ok(operation.operations.taken_away_at);checks++;
let retrieved=await sync(other,'operation',{action:'retrieved'},operation.version);
let ride=await sync(other,'operation',{action:'ride_started'},retrieved.version);
assert.ok(ride.operations.ride_started_at);checks++;
let updated=await sync(other,'update_ops',{patch:{comment:'Updated'}},ride.version);
eq(updated.booking.comment,'Updated');
let detailSnap=await snap(other.id);delete detailSnap.edit_revision;
let detail=await sync(other,'detail',{action:'spot',target:'P-9',expected:detailSnap},updated.version);
eq(detail.booking.spot,'P-9');
let undo=await sync(other,'undo_handover',{action:'in',expected_at:detail.booking.checked_in_at},detail.version);
eq(undo.booking.checked_in_at,null);eq(undo.operations.taken_away_at,null);eq(undo.lifecycle_revision,1);
// Confirm old-client operational and booking changes increment version.
let before=await version(other.id);
await db.query("select public.record_booking_customer_call($1,$2,null,null,1,false)",[randomUUID(),other.id]);
assert.ok(await version(other.id)>before);checks++;
before=await version(other.id);
await db.query("select public.update_booking_ops($1,'{\"comment\":\"Legacy update\"}')",[other.id]);
assert.ok(await version(other.id)>before);checks++;
await db.exec('reset role');
before=await version(other.id);
await db.query('update public.bookings set sync_version=0 where id=$1',[other.id]);
eq(await version(other.id),before+1);
// Active staff required even for receipt replay after deactivation.
await db.query('update public.profiles set active=false where id=$1',[driver]);
await user(driver);await reject(async()=>sync(b,'payment',payment,0,event),'42501');
await db.exec('reset role');await db.query('update public.profiles set active=true where id=$1',[driver]);
// Original replay is immutable, even after status change, and never rewrites current row.
await db.query("update public.bookings set status='cancelled' where id=$1",[b.id]);
await user(driver);eq(await sync(b,'payment',payment,0,event),first);eq((await row(b.id)).status,'cancelled');
// Lifecycle failure is atomic; different event cannot turn cancelled booking into a payment.
await reject(async()=>sync(b,'payment',{...payment,expected_paid_cents:1000},await version(b.id)),'23514');
// Concurrent promises here are single-session PGlite serialization, NOT real row-lock proof.
b=await fresh();await user(driver);
const race=await Promise.allSettled([sync(b,'payment',payment),sync(b,'payment',payment)]);
eq(race.filter(x=>x.status==='fulfilled').length,1);
eq(race.filter(x=>x.status==='rejected'&&x.reason.code==='PT409').length,1);
eq((await row(b.id)).paid,'10.00');
// Missing media must not confirm a handover.
b=await fresh();await user(driver);
const mediaID=randomUUID(),mediaEvent=randomUUID();
await reject(async()=>sync(b,'handover',{action:'in',details:{},media:[{id:mediaID,path:b.id+'/'+mediaEvent+'-'+mediaID+'.png',kind:'photo',mime_type:'image/png',captured_at:'2026-10-01T00:00:00Z',size_bytes:20}],expected_in:null,expected_out:null,expected_revision:0},0,mediaEvent),'23514');
eq((await row(b.id)).checked_in_at,null);eq(await version(b.id),0);
await db.exec('reset role');
eq((await db.query('select count(*)::int n from public.booking_sync_receipts where id=$1',[mediaEvent])).rows[0].n,0);
// Stage valid media, then retry the previously failed event unchanged.
await db.query("insert into storage.objects(bucket_id,name,metadata) values('booking-media',$1,$2::jsonb)",
 [b.id+'/'+mediaEvent+'-'+mediaID+'.png',JSON.stringify({size:20,mimetype:'image/png'})]);
await user(driver);
const mediaPayload={action:'in',details:{},media:[{id:mediaID,path:b.id+'/'+mediaEvent+'-'+mediaID+'.png',
 kind:'photo',mime_type:'image/png',captured_at:'2026-10-01T00:00:00Z',size_bytes:20}],
 expected_in:null,expected_out:null,expected_revision:0};
const staged=await sync(b,'handover',mediaPayload,0,mediaEvent);
assert.ok(staged.booking.checked_in_at);checks++;
eq(await sync(b,'handover',mediaPayload,0,mediaEvent),staged);
await db.exec('reset role');
eq((await db.query('select count(*)::int n from public.booking_media where request_id=$1',[mediaEvent])).rows[0].n,1);
// Do not adopt an existing legacy/direct RPC UUID as a new offline event.
b=await fresh();await user(driver);
const legacyID=randomUUID();
await db.query("select public.record_booking_payment($1,$2,1000,'cash',0,10000)",[legacyID,b.id]);
await reject(async()=>sync(b,'payment',{...payment,expected_paid_cents:1000},await version(b.id),legacyID),'23514');
eq((await row(b.id)).paid,'10.00');
// Explicit predecessor chains accept only their committed version, never an intervening writer.
b=await fresh();await user(driver);
const predecessor=await sync(b,'payment',payment);
async function chained(id=randomUUID(),pred=predecessor.event_id,booking=b.id){
 return (await db.query('select public.sync_booking_event($1,$2,0,$3,$4::jsonb,$5) r',
 [id,booking,'payment',JSON.stringify({...payment,expected_paid_cents:1000}),pred])).rows[0].r;
}
const chainID=randomUUID(),chainResult=await chained(chainID);
eq(chainResult.booking.paid,20);eq(await chained(chainID),chainResult);
await reject(async()=>chained(),'PT409');
await reject(async()=>chained(randomUUID(),randomUUID()),'PT409');
await user(admin);await reject(async()=>chained(randomUUID()),'PT409');
await user(driver);
await reject(async()=>chained(chainID,null),'23514');
// Chained calls/undo ignore predicted client clocks, bind immutable predecessor snapshot.
b=await fresh();await user(driver);
const cfirst=await sync(b,'customer_call',callPayload);
const cid=randomUUID(),predictedClear={expected_called_at:'2099-01-01T00:00:00Z',expected_lifecycle_revision:999};
const clearChain=(payload=predictedClear)=>(db.query('select public.sync_booking_event($1,$2,0,$3,$4::jsonb,$5) r',
 [cid,b.id,'clear_customer_call',JSON.stringify(payload),cfirst.event_id])).then(r=>r.rows[0].r);
const cclear=await clearChain();eq(cclear.operations.customer_called_at,null);
eq(await clearChain(),cclear);
await reject(async()=>clearChain({...predictedClear,expected_lifecycle_revision:998}),'23514');
const hin=await sync(b,'handover',{action:'in',details:{},media:[],expected_in:null,expected_out:null,expected_revision:0},cclear.version);
const ures=(await db.query('select public.sync_booking_event($1,$2,$3,$4,$5::jsonb,$6) r',
 [randomUUID(),b.id,cclear.version,'undo_handover',JSON.stringify({action:'in',expected_at:'2099-01-01T00:00:00Z'}),hin.event_id])).rows[0].r;
eq(ures.booking.checked_in_at,null);eq(ures.booking.lifecycle_revision,1);
// All dependent actions use predecessor snapshots, not predicted local values.
async function dependent(booking,previous,action,payload,baseline=0,id=randomUUID()){
 return (await db.query('select public.sync_booking_event($1,$2,$3,$4,$5::jsonb,$6) r',
 [id,booking.id,baseline,action,JSON.stringify(payload),previous.event_id])).rows[0].r;
}
b=await fresh();await user(driver);
const inbound=await sync(b,'handover',{action:'in',details:{},media:[],expected_in:null,expected_out:null,expected_revision:0});
const outbound=await dependent(b,inbound,'handover',{action:'out',details:{},media:[],
 expected_in:'2099-01-01T00:00:00Z',expected_out:null,expected_revision:999});
assert.ok(outbound.booking.checked_out_at);checks++;
eq(outbound.booking.checked_in_at,inbound.booking.checked_in_at);
const undoOut=await dependent(b,outbound,'undo_handover',{action:'out',expected_at:'2099-01-01T00:00:00Z'});
eq(undoOut.booking.checked_out_at,null);eq(undoOut.lifecycle_revision,1);
const recalled=await dependent(b,undoOut,'customer_call',{...callPayload,expected_checked_out_at:'2099-01-01T00:00:00Z',expected_lifecycle_revision:999});
assert.ok(recalled.operations.customer_called_at);checks++;
const predictedSnapshot={status:'no_show',checked_in_at:null,checked_out_at:'2099-01-01T00:00:00Z',
 spot:'LOCAL',lifecycle_revision:999,detail_revision:999};
const located=await dependent(b,recalled,'detail',{action:'spot',target:'CHAIN-1',expected:predictedSnapshot});
eq(located.booking.spot,'CHAIN-1');
const edited=await dependent(b,located,'safe_edit',{patch:{comment:'Canonical chain'},
 expected:{...predictedSnapshot,edit_revision:999}});
eq(edited.booking.comment,'Canonical chain');eq(edited.booking.spot,'CHAIN-1');
const paidChain=await dependent(b,edited,'payment',{...payment,expected_paid_cents:9999,expected_total_cents:9999});
eq(paidChain.booking.paid,10);
await db.exec('reset role');
await db.query("update public.bookings set comment='External writer' where id=$1",[b.id]);
await user(driver);
await reject(async()=>dependent(b,paidChain,'safe_edit',{patch:{comment:'Must not overwrite'},
 expected:{...predictedSnapshot,edit_revision:999}}),'PT409');
eq((await row(b.id)).comment,'External writer');
// Chaining does not grant admin edit authority or remove explicit repeat intent.
await reject(async()=>dependent(b,paidChain,'safe_edit',{patch:{phone:'No admin'},
 expected:{...predictedSnapshot,edit_revision:999}}),'PT409');
b=await fresh();await user(driver);
const onlyCall=await sync(b,'customer_call',callPayload);
await reject(async()=>dependent(b,onlyCall,'customer_call',callPayload),'23514');
await reject(async()=>dependent(b,onlyCall,'safe_edit',{patch:{phone:'No admin'},
 expected:{...predictedSnapshot,edit_revision:999}}),'42501');
// Standalone gallery photos preserve handover integrity and commit receipt atomically.
b=await fresh();await user(driver);
const galleryEvent=randomUUID(),galleryID=randomUUID();
const galleryItem={id:galleryID,path:b.id+'/'+galleryEvent+'-'+galleryID+'.png',kind:'photo',
 mime_type:'image/png',captured_at:'2026-10-01T00:00:00Z',size_bytes:20};
const galleryPayload={media:[galleryItem]};
await reject(async()=>sync(b,'media_append',galleryPayload,0,galleryEvent),'23514');
eq(await version(b.id),0);
await db.exec('reset role');
await db.query("insert into storage.objects(bucket_id,name,metadata,owner_id) values('booking-media',$1,$2::jsonb,$3)",
 [galleryItem.path,JSON.stringify({size:20,mimetype:'image/png'}),driver]);
await user('','anon');await reject(async()=>sync(b,'media_append',galleryPayload,0,galleryEvent),'42501');
await user(driver);
// A valid canonical path belonging to somebody else's upload is not adoptable.
await db.exec('reset role');
await db.query('update storage.objects set owner_id=$1 where name=$2',[admin,galleryItem.path]);
await user(driver);
await reject(async()=>sync(b,'media_append',galleryPayload,0,galleryEvent),'23514');
await db.exec('reset role');
await db.query('update storage.objects set owner_id=$1 where name=$2',[driver,galleryItem.path]);
await user(driver);
for(const invalid of [
 {media:[]},{media:Array(41).fill(galleryItem)},{media:[{...galleryItem,kind:'signature'}]},{media:[{...galleryItem,mime_type:'video/mp4'}]},
 {media:[{...galleryItem,size_bytes:10485761}]},{media:[{...galleryItem,size_bytes:0}]},{media:[{...galleryItem,size_bytes:1.5}]},
 {media:[{...galleryItem,path:other.id+'/'+galleryEvent+'-'+galleryID+'.png'}]},
 {media:[{...galleryItem,path:b.id+'/'+randomUUID()+'-'+galleryID+'.png'}]},
 {media:[{...galleryItem,captured_at:'2099-01-01T00:00:00Z'}]},
 {media:[{...galleryItem,captured_at:'2026-10-01'}]},
 {media:[{...galleryItem,actor_id:admin}]}
])await reject(async()=>sync(b,'media_append',invalid,0,galleryEvent),'22023');
await reject(async()=>sync(b,'media_append',{media:[{...galleryItem,size_bytes:19}]},0,galleryEvent),'23514');
await reject(async()=>sync(b,'media_append',{media:[{...galleryItem,mime_type:'image/jpeg'}]},0,galleryEvent),'23514');
await reject(async()=>sync(b,'media_append',{media:[{...galleryItem,id:'not-a-uuid'}]},0,galleryEvent),'22P02');
await reject(async()=>sync(b,'media_append',{media:[{...galleryItem,captured_at:null}]},0,galleryEvent),'22023');
// Batch second item missing: first insert and any audit rows must roll back.
const missingItem={...galleryItem,id:randomUUID()};missingItem.path=b.id+'/'+galleryEvent+'-'+missingItem.id+'.png';
await reject(async()=>sync(b,'media_append',{media:[galleryItem,missingItem]},0,galleryEvent),'23514');
eq((await db.query('select count(*)::int n from public.booking_gallery_media')).rows[0].n,0);
const gallery=await sync(b,'media_append',galleryPayload,0,galleryEvent);
eq(gallery.booking.checked_in_at,null);eq(gallery.booking.checked_out_at,null);
eq(gallery.result.media[0].actor_id,driver);eq(gallery.result.media[0].event_id,galleryEvent);
eq(gallery.result.media[0].kind,'photo');assert.ok(gallery.version>0);checks++;
eq(await sync(b,'media_append',galleryPayload,0,galleryEvent),gallery);
eq((await db.query('select count(*)::int n from public.booking_gallery_media')).rows[0].n,1);
await reject(async()=>sync(b,'media_append',galleryPayload,0),'PT409');
await reject(async()=>sync(b,'media_append',{media:[{...galleryItem,size_bytes:19}]},0,galleryEvent),'23514');
await user(admin);await reject(async()=>sync(b,'media_append',galleryPayload,0,galleryEvent),'23514');
await user(driver);
await reject(async()=>db.query("insert into public.booking_gallery_media select * from public.booking_gallery_media"),'42501');
await reject(async()=>db.query('delete from public.booking_gallery_media'),'42501');
await db.exec('reset role');
await reject(async()=>db.query("update public.booking_gallery_media set size_bytes=1"),'42501');
eq((await db.query('select count(*)::int n from public.booking_handovers where booking_id=$1',[b.id])).rows[0].n,0);
eq((await db.query('select count(*)::int n from public.booking_media where booking_id=$1',[b.id])).rows[0].n,0);
await user('','anon');await reject(async()=>db.query('select * from public.booking_gallery_media'),'42501');
await db.exec('reset role');await db.query('update public.profiles set active=false where id=$1',[driver]);
await user(driver);eq((await db.query('select * from public.booking_gallery_media')).rows.length,0);
await reject(async()=>sync(b,'media_append',galleryPayload,0,galleryEvent),'42501');
await db.exec('reset role');await db.query('update public.profiles set active=true where id=$1',[driver]);
await user(driver);
const afterPhoto=await dependent(b,gallery,'safe_edit',{patch:{comment:'Photo then note'},expected:{...predictedSnapshot,edit_revision:999}});
eq(afterPhoto.booking.comment,'Photo then note');
console.log(JSON.stringify({status:'passed',checks,isolated:true,liveWrites:0,note:'PGlite single connection; real multi-session locking not exercised. Duplicate preexisting clear/removals migration omitted; staff pgcrypto unrelated omitted.'}));
await db.close();
