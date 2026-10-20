import 'fake-indexeddb/auto';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {openOfflineStore,type OfflineStore} from './offline-store';
import type {Booking,Employee} from '../model';
const mock=vi.hoisted(()=>({store:null as unknown as OfflineStore,name:'',online:false,user:'alice',rows:[] as Booking[],ops:[] as unknown[],fail:false,queries:[] as {table:string;range?:number[];signal?:AbortSignal}[],rpc:vi.fn(),upload:vi.fn(),getUser:vi.fn()}));
vi.mock('./offline-store',async original=>({...await original<typeof import('./offline-store')>(),openOfflineStore:async()=>mock.store}));
vi.mock('./offline-shell',()=>({registerOfflineShell:vi.fn().mockResolvedValue(null)}));
vi.mock('../api',()=>({db:{
 auth:{getUser:()=>mock.getUser()},
 from:(table:string)=>{
  const entry:{table:string;range?:number[];signal?:AbortSignal}={table};mock.queries.push(entry);
  let identity=false;
  const q={select:()=>q,order:()=>q,eq:()=>{identity=true;return q},range:(a:number,b:number)=>{entry.range=[a,b];return q},
   abortSignal:(s:AbortSignal)=>{entry.signal=s;return q},maybeSingle:async()=>({data:{id:mock.user,role:'admin',active:true},error:null}),
   then:(resolve:(v:unknown)=>unknown,reject?:(e:unknown)=>unknown)=>Promise.resolve(mock.fail?{data:null,error:new Error('Network interrupted')}:{data:identity?{id:mock.user,role:'admin',active:true}:table==='profiles'?[{id:mock.user,full_name:'Alice',role:'admin',active:true}]:((table==='bookings'?mock.rows:mock.ops).slice(entry.range?.[0]??0,(entry.range?.[1]??999999)+1)),error:null}).then(resolve,reject)};
  return q;
 },
 rpc:(name:string,args:unknown)=>({abortSignal:(signal:AbortSignal)=>mock.rpc(name,args,signal)}),
 storage:{from:()=>({upload:mock.upload,list:async()=>({data:[],error:null})})}
}}));
const alice={id:'alice',role:'admin',full_name:'Alice'} as Employee;
const bob={id:'bob',role:'admin',full_name:'Bob'} as Employee;
const scope={userId:'alice',role:'admin'};
const booking=(extra:Partial<Booking>={})=>({id:'10000000-0000-0000-0000-000000000001',customer_name:'Original',sync_version:1,status:'confirmed',arrival_at:'2026-10-20',departure_at:'2026-10-22',...extra} as Booking);
let client:typeof import('./offline-client');
async function seed(rows=[booking()]){
 await mock.store.putSnapshot(scope,'data',{rows,staff:[alice],operations:[],at:123,complete:true});
}
async function queue(extra:Partial<Parameters<typeof client.enqueueOffline>[0]>={}){
 const b=client.cachedOfflineBookings()[0];
 return client.enqueueOffline({booking:b,kind:'safe_edit',payload:{patch:{customer_name:'Pending'}},projected:{...b,customer_name:'Pending'},...extra});
}
async function boot(online=false){
 mock.online=online;client=await import('./offline-client');await client.startOfflineAccount(alice);await client.retryOffline();
}
beforeEach(async()=>{
 vi.resetModules();mock.name=crypto.randomUUID();mock.store=await (await vi.importActual<typeof import('./offline-store')>('./offline-store')).openOfflineStore(mock.name);mock.online=false;mock.user='alice';mock.rows=[];mock.ops=[];mock.fail=false;mock.queries=[];
 mock.getUser.mockReset().mockImplementation(async()=>({data:{user:{id:mock.user}},error:null}));mock.rpc.mockReset();mock.upload.mockReset().mockResolvedValue({error:null});
 vi.stubGlobal('navigator',{get onLine(){return mock.online}});
});
afterEach(async()=>{await client?.startOfflineAccount(null);await client?.retryOffline();mock.store.close();vi.restoreAllMocks();vi.unstubAllGlobals()});
describe('offline runtime with actual IndexedDB',()=>{
 it('flag off: enqueue and retry are blocked, zero RPC, zero pending, cache reads still work',async()=>{
  await seed();await boot(true);vi.stubEnv('VITE_DURABLE_OFFLINE_WRITES','false');
  await expect(queue()).rejects.toThrow(/deaktiviert|disabled/i);
  await client.retryOffline(true);
  expect(mock.rpc).not.toHaveBeenCalled();expect(client.offlineSnapshot().pending).toBe(0);expect(await mock.store.list(scope,{includeConfirmed:true})).toEqual([]);
  expect(client.cachedOfflineBookings()).toHaveLength(1);vi.unstubAllEnvs();
 });
 it('explicit purge removes this account cache only when nothing is pending; restart keeps it',async()=>{
  await seed();await boot();await client.startOfflineAccount(null);await client.startOfflineAccount(alice);
  expect(client.cachedOfflineBookings()).toHaveLength(1);
  const r=await queue();await expect(client.purgeOfflineAccount()).rejects.toThrow(/Unsynced/);expect(client.cachedOfflineBookings()).toHaveLength(1);
  await mock.store.discardFrom(scope,(await mock.store.list(scope))[0].seq,true);
  await client.purgeOfflineAccount();expect(await mock.store.getSnapshot(scope,'data')).toBeUndefined();expect(client.cachedOfflineBookings()).toHaveLength(0);void r;
 });
 it('purges explicit signed-out user even after the auth callback cleared scope',async()=>{
  await seed();await boot();await client.startOfflineAccount(null);
  await client.purgeOfflineAccount('alice');
  expect(await mock.store.getSnapshot(scope,'data')).toBeUndefined();
  expect(await client.offlineAccountFor('alice')).toBeNull();
 });
 it('starts from persisted account cache and never queries the backend offline',async()=>{
  await seed();await boot();expect(await client.offlineLoad()).toMatchObject({rows:[{customer_name:'Original'}]});expect(client.offlineSnapshot()).toMatchObject({ready:true,cacheAt:123,cacheCount:1,complete:true});expect(mock.queries).toEqual([]);
  expect(await client.offlineAccountFor('alice')).toEqual(alice);
 });
 it('cold offline startup explicitly refuses to invent a complete dataset',async()=>{
  await boot();await expect(client.offlineLoad()).rejects.toThrow('No cached');expect(client.offlineSnapshot().complete).toBe(false);
 });
 it('loads every deterministic RLS page and passes through abort signals',async()=>{
  await boot();mock.online=true;mock.rows=Array.from({length:1001},(_,i)=>booking({id:String(i)}));
  const ctl=new AbortController();const result=await client.offlineLoad(ctl.signal);
  expect(result.rows).toHaveLength(1001);expect(mock.queries.filter(q=>q.table==='bookings').map(q=>q.range)).toEqual([[0,499],[500,999],[1000,1499]]);
  expect(mock.queries.every(q=>q.signal===ctl.signal)).toBe(true);expect(client.offlineSnapshot().complete).toBe(true);
  mock.online=false;await client.startOfflineAccount(null);await client.startOfflineAccount(alice);expect((await client.offlineLoad()).rows).toHaveLength(1001);
 });
 it('aborted loading never replaces the cached dataset',async()=>{
  await seed();await boot();mock.online=true;const ctl=new AbortController();ctl.abort();
  await expect(client.offlineLoad(ctl.signal)).rejects.toMatchObject({name:'AbortError'});expect(client.cachedOfflineBookings()[0].customer_name).toBe('Original');
 });
 it('partial online failure returns the old complete cache with a visible error',async()=>{
  await seed();await boot();mock.online=true;mock.fail=true;
  expect((await client.offlineLoad()).rows[0].customer_name).toBe('Original');expect(client.offlineSnapshot()).toMatchObject({complete:true,error:'Network interrupted',cacheAt:123});
 });
 it('durable enqueue survives account restart without persisting projections as canonical',async()=>{
  await seed();await boot();const r=await queue();expect(r.booking.offline_pending).toBe(true);
  expect((await mock.store.getSnapshot<{rows:Booking[]}>(scope,'data'))!.rows[0].customer_name).toBe('Original');
  await client.startOfflineAccount(null);await client.startOfflineAccount(alice);
  expect(client.cachedOfflineBookings()[0]).toMatchObject({customer_name:'Pending',offline_pending:true});expect(client.offlineSnapshot().pending).toBe(1);
 });
 it('account and role switches reveal no previous cache or pending projections',async()=>{
  await seed();await boot();await queue();await client.startOfflineAccount(bob);expect(client.cachedOfflineBookings()).toEqual([]);expect(client.offlineSnapshot().pending).toBe(0);
  await client.startOfflineAccount({...alice,role:'driver'});expect(client.cachedOfflineBookings()).toEqual([]);await client.startOfflineAccount(alice);expect(client.offlineSnapshot().pending).toBe(1);
 });
 it('quota failure rolls back durable event and produces no optimistic UI projection',async()=>{
  await seed();await boot();const original=IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(this:IDBObjectStore,...args:Parameters<IDBObjectStore['add']>){if(this.name==='blobs')throw new DOMException('Full','QuotaExceededError');return original.apply(this,args)});
  await expect(queue()).rejects.toMatchObject({name:'QuotaExceededError'});expect(await mock.store.list(scope)).toEqual([]);expect(client.cachedOfflineBookings()[0].customer_name).toBe('Original');
 });
 it('retries exact immutable UUID, rejects changed payload, and links same booking predecessors',async()=>{
  await seed();await boot();const id=crypto.randomUUID();await queue({id});await queue({id});expect(await mock.store.list(scope)).toHaveLength(1);
  await expect(queue({id,payload:{changed:true}})).rejects.toThrow('changed');
  const next=await queue({payload:{second:true}});const events=await mock.store.list(scope);expect(events[1].id).toBe(next.eventId);expect(events[1].baseline).toMatchObject({version:1,predecessor:id});
 });
 it('explicit tail discard removes its optimistic projection and restores canonical cache',async()=>{
  await seed();await boot();await queue();await expect(client.discardOfflineFrom(1,false)).rejects.toThrow();
  await client.discardOfflineFrom(1,true);expect(client.cachedOfflineBookings()[0].customer_name).toBe('Original');expect(client.offlineSnapshot().pending).toBe(0);
 });
 it('confirmed old receipt cannot overwrite a newer synchronized server version',async()=>{
  await seed();await boot();const r=await queue();await mock.store.lease(scope,'test',Date.now(),10000);
  await mock.store.confirmReceipt(scope,r.eventId,{eventId:r.eventId,booking:booking({sync_version:2,customer_name:'Receipt'})},'test');
  await mock.store.release(scope,'test');await client.startOfflineAccount(null);
  await seed([booking({sync_version:5,customer_name:'Fresher'})]);await client.startOfflineAccount(alice);
  expect(client.cachedOfflineBookings()[0].customer_name).toBe('Fresher');
 });
 it('another store connection broadcasts and rehydrates durable pending events',async()=>{
  await seed();await boot();let notified=0;const unsub=client.subscribeOffline(()=>notified++);
  const other=await (await vi.importActual<typeof import('./offline-store')>('./offline-store')).openOfflineStore(mock.name);
  await other.enqueue(scope,{bookingId:booking().id,kind:'safe_edit',payload:{},baseline:{version:1,predecessor:null,projected:booking({customer_name:'Other tab'})}});other.close();
  await vi.waitFor(()=>expect(client.cachedOfflineBookings()[0].customer_name).toBe('Other tab'));expect(notified).toBeGreaterThan(0);unsub();
 });
 it.each(['id','path'])('uploads durable receipt media addressed by %s and sends predecessor contract',async key=>{
  await seed();await boot(true);mock.online=false;
  const id=crypto.randomUUID(),path=booking().id+'/'+id+'-photo.jpg',blob=new Blob(['photo'],{type:'image/jpeg'});
  await queue({id,payload:{media:[{id:'photo',path,mime_type:'image/jpeg',size_bytes:blob.size}]},blobs:{[key==='id'?'photo':path]:blob}});
  mock.rpc.mockImplementation(async(_name,args)=>({error:null,data:{event_id:args.p_event_id,booking_id:args.p_booking_id,booking:booking({sync_version:2}),version:2}}));
  mock.online=true;await client.retryOffline();
  expect(mock.upload).toHaveBeenCalledWith(path,expect.any(Blob),expect.objectContaining({upsert:false}));
  expect(mock.rpc).toHaveBeenCalledWith('sync_booking_event',expect.objectContaining({p_event_id:id,p_expected_version:1,p_predecessor_id:null}),expect.any(AbortSignal));
  expect((await mock.store.list(scope,{includeConfirmed:true}))[0].state).toBe('confirmed');expect(await mock.store.getBlobs(scope,id)).toEqual({});
 });
 it('lost acknowledgement retries the same UUID and immutable contract after refresh',async()=>{
  await seed();await boot(true);mock.online=false;const r=await queue();const calls:unknown[]=[];
  mock.rpc.mockImplementation(async(_name,args)=>{calls.push(args);throw new TypeError('Connection lost after commit')});
  mock.online=true;await client.retryOffline();expect((await mock.store.list(scope))[0].state).toBe('pending');
  mock.online=false;await client.startOfflineAccount(null);await mock.store.retry(scope,r.eventId);
  await client.startOfflineAccount(alice);mock.online=true;
  mock.rpc.mockImplementation(async(_name,args)=>{calls.push(args);return {error:null,data:{event_id:args.p_event_id,booking_id:args.p_booking_id,booking:booking({sync_version:2}),version:2}}});
  // The runtime's reconnect listener updates state.online in browsers. Re-enter an online runtime here.
  await client.startOfflineAccount(null);vi.resetModules();client=await import('./offline-client');await client.startOfflineAccount(alice);await client.retryOffline();
  expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);expect(client.offlineSnapshot().pending).toBe(0);
 });
 it('canonical receipt persistence preserves unrelated rows and never commits other pending projections',async()=>{
  const a=booking(),b=booking({id:'20000000-0000-0000-0000-000000000002',customer_name:'Other original'}),c=booking({id:'30000000-0000-0000-0000-000000000003',customer_name:'Untouched'});
  await seed([a,b,c]);await boot(true);mock.online=false;
  const first=await queue();
  await queue({booking:b,projected:{...b,customer_name:'Other pending'},payload:{patch:{customer_name:'Other pending'}}});
  mock.rpc.mockImplementation(async(_name,args)=>{
   if(args.p_event_id!==first.eventId)throw {code:'PT409',message:'Blocked second'};
   return {error:null,data:{event_id:first.eventId,booking_id:a.id,booking:{...a,customer_name:'Canonical first',sync_version:2},version:2}};
  });
  mock.online=true;await client.retryOffline();await client.retryOffline();
  expect((await mock.store.list(scope,{includeConfirmed:true}))[0]).toMatchObject({state:'confirmed'});
  const persisted=await mock.store.getSnapshot<{rows:Booking[]}>(scope,'data');
  expect(persisted!.rows).toHaveLength(3);
  expect(persisted!.rows.find(r=>r.id===a.id)).toMatchObject({customer_name:'Canonical first',sync_version:2});
  expect(persisted!.rows.find(r=>r.id===b.id)).toMatchObject({customer_name:'Other original'});
  expect(persisted!.rows.some(r=>r.offline_pending)).toBe(false);
  expect(client.cachedOfflineBookings().find(r=>r.id===b.id)).toMatchObject({customer_name:'Other pending',offline_pending:true});
  mock.online=false;await client.startOfflineAccount(null);await client.startOfflineAccount(alice);
  expect(client.cachedOfflineBookings()).toHaveLength(3);expect(client.cachedOfflineBookings().find(r=>r.id===b.id)?.customer_name).toBe('Other pending');
  await client.discardOfflineFrom(2,true);
  expect(client.cachedOfflineBookings().find(r=>r.id===b.id)?.customer_name).toBe('Other original');
 });
 it('manual retry resets backoff but keeps exact UUID and never retries conflicts',async()=>{
  await seed();await boot(true);mock.online=false;const r=await queue();
  mock.rpc.mockRejectedValue(new TypeError('Temporary'));mock.online=true;await client.retryOffline();
  expect(mock.rpc).toHaveBeenCalledTimes(1);await client.retryOffline();expect(mock.rpc).toHaveBeenCalledTimes(1);
  mock.rpc.mockRejectedValue({code:'PT409'});await client.retryOffline(true);expect(mock.rpc).toHaveBeenCalledTimes(2);
  await client.retryOffline(true);expect(mock.rpc).toHaveBeenCalledTimes(2);expect((await mock.store.list(scope))[0]).toMatchObject({id:r.eventId,state:'conflict'});
 });
 it('a real reconnect event automatically drains after joining an older auth run',async()=>{
  const win=new EventTarget();vi.stubGlobal('window',win);
  vi.stubGlobal('document',{querySelector:()=>null,activeElement:null});
  await seed();await boot(true);mock.online=false;win.dispatchEvent(new Event('offline'));const queued=await queue();
  let release!:(value:unknown)=>void;
  mock.getUser.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}));
  mock.rpc.mockImplementation(async(_name,args)=>({error:null,data:{event_id:args.p_event_id,booking_id:args.p_booking_id,booking:booking({sync_version:2}),version:2}}));
  mock.online=true;win.dispatchEvent(new Event('online'));
  await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
  mock.online=false;win.dispatchEvent(new Event('offline'));
  mock.online=true;win.dispatchEvent(new Event('online'));
  release({data:{user:{id:'wrong-old-auth'}},error:null});
  await vi.waitFor(()=>expect(client.offlineSnapshot().pending).toBe(0));
  expect(mock.rpc).toHaveBeenCalledTimes(1);
  expect((await mock.store.list(scope,{includeConfirmed:true}))[0]).toMatchObject({id:queued.eventId,state:'confirmed'});
 });
 it.each(['handover','media_append'])('pending %s media persists across restart, isolates accounts and clears after receipt',async kind=>{
  await seed();await boot();
  const id=crypto.randomUUID(),path=booking().id+'/'+id+'-photo.jpg';
  const metadata={id:'photo',path,kind:'photo',mime_type:'image/jpeg',captured_at:'2026-10-20T12:00:00Z',size_bytes:5};
  const queued=await queue({id,kind,payload:{action:'in',media:[metadata]},blobs:{photo:new Blob(['photo'],{type:'image/jpeg'})}});
  expect(await client.pendingOfflineMedia(booking().id)).toHaveLength(1);
  await client.startOfflineAccount(null);await client.startOfflineAccount(alice);
  const persisted=await client.pendingOfflineMedia(booking().id);
  expect(persisted[0].item).toEqual({...metadata,action:'in'});expect(await persisted[0].blob.text()).toBe('photo');
  await client.startOfflineAccount(bob);expect(await client.pendingOfflineMedia(booking().id)).toEqual([]);
  await client.startOfflineAccount(alice);
  await mock.store.lease(scope,'media-receipt',Date.now(),10000);
  await mock.store.confirmReceipt(scope,queued.eventId,{eventId:queued.eventId,booking:booking({sync_version:2})},'media-receipt');
  await mock.store.release(scope,'media-receipt');
  expect(await client.pendingOfflineMedia(booking().id)).toEqual([]);expect(await mock.store.getBlobs(scope,id)).toEqual({});
 });
 it('shell activation guard protects dialogs, all forms, focused drafts and pending changes',async()=>{
  const win=new EventTarget();vi.stubGlobal('window',win);
  let protectedNode=false,focused=false;const query=vi.fn((_selector:string)=>protectedNode?{}:null);
  vi.stubGlobal('document',{querySelector:query,get activeElement(){return focused?{matches:()=>true}:null}});
  await seed();await boot();
  const {registerOfflineShell}=await import('./offline-shell');
  const options=vi.mocked(registerOfflineShell).mock.calls.at(-1)![0];
  expect(options.isBlocked()).toBe(false);
  protectedNode=true;expect(options.isBlocked()).toBe(true);
  expect(query.mock.calls.at(-1)![0]).toContain('[role="dialog"]:not([hidden])');
  protectedNode=false;focused=true;expect(options.isBlocked()).toBe(true);
  focused=false;await queue();expect(options.isBlocked()).toBe(true);
 });
 it('a deferred RPC after account switch cannot acknowledge or leak the old account projection',async()=>{
  await seed();await boot(true);mock.online=false;const r=await queue();
  let resolve!:(v:unknown)=>void;mock.rpc.mockImplementation(()=>new Promise(r=>{resolve=r}));mock.online=true;const syncing=client.retryOffline();
  await vi.waitFor(()=>expect(mock.rpc).toHaveBeenCalledTimes(1));mock.user='bob';await client.startOfflineAccount(bob);
  resolve({error:null,data:{event_id:r.eventId,booking_id:booking().id,booking:booking({customer_name:'Alice receipt'}),version:2}});
  await syncing;expect(client.cachedOfflineBookings()).toEqual([]);expect(client.offlineSnapshot().accountId).toBe('bob');expect((await mock.store.list(scope))[0].state).not.toBe('confirmed');
 });
});
