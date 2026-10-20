import 'fake-indexeddb/auto';
import {describe,it,expect,vi} from 'vitest';
import {openDB} from 'idb';
import {openOfflineStore, type OfflineStore, type OfflineScope} from './offline-store';
import {OfflineSync,OfflineSyncError} from './offline-sync';
const s={userId:'alice',role:'admin'},other={userId:'bob',role:'admin'};
const input=()=>({bookingId:'booking',kind:'edit',payload:{name:'A'},baseline:{version:1}});
const fresh=()=>openOfflineStore(crypto.randomUUID());
function sync(store:OfflineStore,execute:any,extra:any={}){
 return new OfflineSync(store,{scope:s,currentScope:()=>s,validateAuth:async()=>true,execute,...extra});
}
describe('durable outbox public contract',()=>{
 it('persists snapshots and blobs across reload, isolated by account and role',async()=>{
  const name=crypto.randomUUID();let db=await openOfflineStore(name);
  await db.putSnapshot(s,'day',[1]);await db.putSnapshot({...s,role:'staff'},'day',[2]);
  const e=await db.enqueue(s,input(),{photo:new Blob(['photo'])});db.close();db=await openOfflineStore(name);
  expect(await db.getSnapshot(s,'day')).toEqual([1]);expect(await db.getSnapshot(other,'day')).toBeUndefined();
  expect(await db.getSnapshot({...s,role:'staff'},'day')).toEqual([2]);
  expect(await (await db.getBlobs(s,e.id)).photo.text()).toBe('photo');
  await expect(db.getBlobs(other,e.id)).rejects.toThrow('Scope');db.close();
 });
 it('rejects duplicate UUID without changing original event, sequence or blobs',async()=>{
  const db=await fresh(),e=await db.enqueue(s,input(),{photo:new Blob(['original'])});
  await expect(db.enqueue(s,{...input(),id:e.id},{photo:new Blob(['replacement'])})).rejects.toThrow();
  expect((await db.enqueue(s,input())).seq).toBe(2);
  expect(await (await db.getBlobs(s,e.id)).photo.text()).toBe('original');db.close();
 });
 it('atomic failure retains neither event nor consumed sequence',async()=>{
  const db=await fresh();
  await expect(db.enqueue(s,input(),{bad:(()=>{}) as unknown as Blob})).rejects.toThrow();
  expect(await db.list(s)).toEqual([]);expect((await db.enqueue(s,input())).seq).toBe(1);db.close();
 });
 it('quota error during blob insertion is visible and rolls back event and counter',async()=>{
  const db=await fresh();const original=IDBObjectStore.prototype.add;
  const spy=vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(this:IDBObjectStore,...args:Parameters<IDBObjectStore['add']>){
   if(this.name==='blobs')throw new DOMException('Storage full','QuotaExceededError');
   return original.apply(this,args);
  });
  await expect(db.enqueue(s,input(),{photo:new Blob(['x'])})).rejects.toMatchObject({name:'QuotaExceededError'});
  spy.mockRestore();expect(await db.list(s)).toEqual([]);expect((await db.enqueue(s,input())).seq).toBe(1);db.close();
 });
 it('upgrades v1 without losing snapshots',async()=>{
  const name=crypto.randomUUID(),legacy=await openDB(name,1,{upgrade(db){
   db.createObjectStore('snapshots');db.createObjectStore('events',{keyPath:'id'}).createIndex('account','userId');
   db.createObjectStore('blobs',{keyPath:'id'});db.createObjectStore('counters');
  }});
  await legacy.put('snapshots',[9],JSON.stringify(['alice','admin','day']));legacy.close();
  const db=await openOfflineStore(name);expect(await db.getSnapshot(s,'day')).toEqual([9]);expect(await db.lease(s,'leader',0,10)).toBe(true);db.close();
 });
 it('FIFO, receipt retained and blobs removed only with matching receipt',async()=>{
  const db=await fresh(),a=await db.enqueue(s,input(),{p:new Blob(['x'])}),b=await db.enqueue(s,input());
  const calls:string[]=[];
  expect(await sync(db,async(e:any)=>{calls.push(e.id);expect((await db.getBlobs(s,a.id)).p).toBeDefined();return {eventId:'wrong'};}).run()).toMatchObject({reason:'backoff'});
  expect(calls).toEqual([a.id]);expect((await db.getBlobs(s,a.id)).p).toBeDefined();
  expect(await sync(db,async(e:any)=>{calls.push(e.id);return {eventId:e.id};},{now:()=>Date.now()+2000}).run()).toEqual({reason:'empty'});
  expect(calls).toEqual([a.id,a.id,b.id]);expect(await db.getBlobs(s,a.id)).toEqual({});
  expect((await db.list(s,{includeConfirmed:true}))[0].receipt).toEqual({eventId:a.id});db.close();
 });
 it('conflict blocks all later bookings and explicit discard removes tail',async()=>{
  const db=await fresh(),a=await db.enqueue(s,input());await db.enqueue(s,{...input(),bookingId:'different'});
  const execute=vi.fn(async()=>{throw new OfflineSyncError('conflict','changed');});
  expect(await sync(db,execute).run()).toMatchObject({reason:'blocked'});
  await sync(db,execute).run();expect(execute).toHaveBeenCalledTimes(1);
  await expect(db.discardFrom(s,a.seq,false)).rejects.toThrow('confirmation');
  await db.discardFrom(s,a.seq,true);expect(await db.list(s)).toEqual([]);db.close();
 });
 it('auth and account mismatch never execute; old role blocks',async()=>{
  const db=await fresh();await db.enqueue(s,input());const execute=vi.fn();
  expect(await sync(db,execute,{currentScope:()=>other}).run()).toMatchObject({reason:'auth'});
  expect(await sync(db,execute,{validateAuth:async()=>false}).run()).toMatchObject({reason:'auth'});
  await db.enqueue({...s,role:'staff'},input());
  expect(await sync(db,execute,{scope:{...s,role:'staff'},currentScope:()=>({...s,role:'staff'})}).run()).toMatchObject({reason:'blocked'});
  expect(execute).not.toHaveBeenCalled();db.close();
 });
 it('lost ack retries same UUID and respects exponential backoff',async()=>{
  const db=await fresh(),e=await db.enqueue(s,input());let time=10000;let count=0;const ids:string[]=[];
  const engine=sync(db,async(event:any)=>{ids.push(event.id);if(count++===0)throw new Error('ack lost');return {eventId:event.id};},{now:()=>time});
  expect(await engine.run()).toEqual({reason:'backoff',nextAttempt:11000});
  expect(await engine.run()).toEqual({reason:'backoff',nextAttempt:11000});
  time=11000;expect(await engine.run()).toEqual({reason:'empty'});expect(ids).toEqual([e.id,e.id]);db.close();
 });
 it('two connections permit only one executing leader',async()=>{
  const name=crypto.randomUUID(),a=await openOfflineStore(name),b=await openOfflineStore(name);await a.enqueue(s,input());
  let release!:()=>void;const wait=new Promise<void>(r=>release=r);let started!:()=>void;const ready=new Promise<void>(r=>started=r);
  const task=sync(a,async(e:any)=>{started();await wait;return {eventId:e.id};}).run();await ready;
  const execute=vi.fn();expect(await sync(b,execute).run()).toEqual({reason:'busy'});expect(execute).not.toHaveBeenCalled();
  release();await task;a.close();b.close();
 });
 it('account switching in flight leaves durable event/blobs unconfirmed',async()=>{
  const db=await fresh(),e=await db.enqueue(s,input(),{p:new Blob(['x'])});let current:OfflineScope=s;
  expect(await sync(db,async(event:any)=>{current=other;return {eventId:event.id};},{currentScope:()=>current}).run()).toEqual({reason:'stopped'});
  expect((await db.list(s))[0].state).toBe('sending');expect((await db.getBlobs(s,e.id)).p).toBeDefined();db.close();
 });
 it('permanent rejection remains failed, with blobs retained',async()=>{
  const db=await fresh(),e=await db.enqueue(s,input(),{p:new Blob(['x'])});
  const execute=vi.fn(async()=>{throw new OfflineSyncError('permanent','bad request');});
  expect(await sync(db,execute).run()).toMatchObject({reason:'blocked'});
  expect((await db.list(s))[0].state).toBe('failed');expect((await db.getBlobs(s,e.id)).p).toBeDefined();db.close();
 });
 it('stop aborts executor and retains recoverable sending event',async()=>{
  const db=await fresh();await db.enqueue(s,input());let ready!:()=>void;const started=new Promise<void>(r=>ready=r);
  const engine=sync(db,async(_e:any,_b:any,signal:AbortSignal)=>{ready();await new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));});
  const running=engine.run();await started;engine.stop();expect(await running).toEqual({reason:'stopped'});
  expect((await db.list(s))[0].state).toBe('sending');db.close();
 });
 it('network retries increase delay without replacing UUID',async()=>{
  const db=await fresh(),e=await db.enqueue(s,input());let time=10000;
  const engine=sync(db,async()=>{throw new OfflineSyncError('network','offline');},{now:()=>time});
  expect(await engine.run()).toMatchObject({nextAttempt:11000});time=11000;
  expect(await engine.run()).toMatchObject({nextAttempt:13000});
  expect((await db.list(s))[0]).toMatchObject({id:e.id,attempts:2,state:'pending'});db.close();
 });
 it('retry preserves exact ID and payload and cannot reorder a tail event',async()=>{
  const db=await fresh(),a=await db.enqueue(s,input()),b=await db.enqueue(s,input());
  await expect(db.retry(s,b.id)).rejects.toThrow('head');
  expect(await db.retry(s,a.id)).toMatchObject({id:a.id,payload:a.payload,baseline:a.baseline,schemaVersion:1});db.close();
 });
 it('subscription fires only after durable local commit and unsubscribe works',async()=>{
  const db=await fresh(),fn=vi.fn(),off=db.subscribe(fn);
  await db.enqueue(s,input());expect(fn).toHaveBeenCalledTimes(1);
  off();await db.enqueue(s,input());expect(fn).toHaveBeenCalledTimes(1);db.close();
 });
 it('Web Locks busy response avoids any execution',async()=>{
  const db=await fresh();await db.enqueue(s,input());const execute=vi.fn();
  vi.stubGlobal('navigator',{locks:{request:vi.fn(async(_n:any,_o:any,fn:any)=>fn(null))}});
  try{expect(await sync(db,execute).run()).toEqual({reason:'busy'});expect(execute).not.toHaveBeenCalled();}
  finally{vi.unstubAllGlobals();db.close();}
 });
 it('cross-tab subscription receives committed updates',async()=>{
  const name=crypto.randomUUID(),a=await openOfflineStore(name),b=await openOfflineStore(name);
  const notified=new Promise<void>(resolve=>b.subscribe(resolve));
  await a.enqueue(s,input());await notified;expect((await b.list(s)).length).toBe(1);a.close();b.close();
 });
 it('same UUID identical immutable input returns existing even after confirmation',async()=>{
  const db=await fresh(),data=input(),blobs={p:new Blob(['x'])},a=await db.enqueue(s,data,blobs);
  expect((await db.enqueue(s,{...data,id:a.id},blobs)).seq).toBe(a.seq);
  await db.lease(s,'owner',Date.now(),10000);
  await db.confirmReceipt(s,a.id,{eventId:a.id},'owner',Date.now(),[{key:'canonical',value:{version:2}}]);
  expect(await db.getSnapshot(s,'canonical')).toEqual({version:2});
  expect(await db.getBlobs(s,a.id)).toEqual({});
  expect((await db.enqueue(s,{...data,id:a.id},blobs)).state).toBe('confirmed');
  await expect(db.enqueue(s,{...data,id:a.id},{p:new Blob(['y'])})).rejects.toThrow('immutable');
  db.close();
 });
 it('canonical snapshot clone failure rolls back receipt confirmation and blob deletion',async()=>{
  const db=await fresh(),a=await db.enqueue(s,input(),{p:new Blob(['x'])});
  await db.lease(s,'owner',Date.now(),10000);
  await expect(db.confirmReceipt(s,a.id,{eventId:a.id},'owner',Date.now(),[{key:'bad',value:()=>{}}])).rejects.toThrow();
  expect((await db.getEvent(s,a.id))?.state).toBe('pending');expect((await db.getBlobs(s,a.id)).p).toBeDefined();db.close();
 });
 it('expired leader cannot commit; new leader can recover',async()=>{
  const db=await fresh(),e=await db.enqueue(s,input());await db.lease(s,'old',0,10);
  expect(await db.lease(s,'new',11,100)).toBe(true);
  await expect(db.transition(s,e.id,'old',12,{state:'confirmed',receipt:{eventId:e.id}})).rejects.toThrow('Lease lost');
  await db.transition(s,e.id,'new',12,{state:'confirmed',receipt:{eventId:e.id}});db.close();
 });
});
