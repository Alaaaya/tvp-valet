import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
export interface OfflineScope { userId: string; role: string }
export type OutboxState = 'pending' | 'sending' | 'conflict' | 'failed' | 'confirmed';
export interface OfflineReceipt { eventId: string; [key: string]: unknown }
export interface OutboxEvent extends OfflineScope {
 schemaVersion:1; id:string; bookingId:string; kind:string; payload:unknown; baseline:unknown;
 createdAt:number; seq:number; attempts:number; nextAttempt:number; state:OutboxState;
 blobFingerprints?:Record<string,string>; error?:string; receipt?:OfflineReceipt;
}
export type EventInput = Pick<OutboxEvent,'bookingId'|'kind'|'payload'|'baseline'> & {id?:string};
interface Lease { userId:string; owner:string; expiresAt:number }
interface Schema extends DBSchema {
 snapshots:{key:string;value:unknown};
 events:{key:string;value:OutboxEvent;indexes:{account:string}};
 blobs:{key:string;value:{id:string;blobs:Record<string,Blob>}};
 counters:{key:string;value:number};
 leases:{key:string;value:Lease};
}
export interface SnapshotWrite {key:string;value:unknown}
function canonical(value:unknown):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value)??String(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
}
async function fingerprintBlobs(blobs:Record<string,Blob>){
 const result:Record<string,string>={};
 for(const [k,b] of Object.entries(blobs)){
  const digest=await crypto.subtle.digest('SHA-256',await b.arrayBuffer());
  result[k]=b.type+':'+b.size+':'+Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
 }return result;
}
async function sameBlobs(a:Record<string,Blob>,b:Record<string,Blob>){
 const keys=Object.keys(a).sort();if(canonical(keys)!==canonical(Object.keys(b).sort()))return false;
 for(const k of keys){
  if(a[k].type!==b[k].type||a[k].size!==b[k].size)return false;
  const x=new Uint8Array(await a[k].arrayBuffer()),y=new Uint8Array(await b[k].arrayBuffer());
  if(x.some((v,i)=>v!==y[i]))return false;
 }return true;
}
export const sameOfflineScope=(a:OfflineScope|null,b:OfflineScope)=>!!a&&a.userId===b.userId&&a.role===b.role;
function valid(s:OfflineScope){if(!s.userId||!s.role)throw new Error('Account and role required');}
const key=(s:OfflineScope,k:string)=>JSON.stringify([s.userId,s.role,k]);
export async function openOfflineStore(name='tvp-offline-v1'){
 const db=await openDB<Schema>(name,3,{
 upgrade(db,old,_new,tx){
  if(old<1){
   db.createObjectStore('snapshots');
   db.createObjectStore('events',{keyPath:'id'}).createIndex('account','userId');
   db.createObjectStore('blobs',{keyPath:'id'}); db.createObjectStore('counters');
  }
  if(old<2)db.createObjectStore('leases',{keyPath:'userId'});
  if(old>=1&&old<3){
   // Development v1/v2 used accountId. Preserve event IDs, payloads and ordering.
   const events=tx.objectStore('events');
   events.deleteIndex('account');events.createIndex('account','userId');
   void (async()=>{
    let cursor=await events.openCursor();
    while(cursor){
     const row=cursor.value as OutboxEvent & {accountId?:string};
     const {accountId,...rest}=row;
     await cursor.update({...rest,userId:row.userId??accountId??'',schemaVersion:1});
     cursor=await cursor.continue();
    }
   })();
   if(old>=2){
    db.deleteObjectStore('leases');db.createObjectStore('leases',{keyPath:'userId'});
   }
  }
 },blocking(){db.close();}
 });return new OfflineStore(db);
}
/** Data only: callers must not put tokens or credentials in payloads/snapshots. */
export class OfflineStore {
 private listeners=new Set<()=>void>();
 private channel:BroadcastChannel|null;
 constructor(private db:IDBPDatabase<Schema>){
  this.channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel('tvp-offline:'+db.name);
  if(this.channel)this.channel.onmessage=()=>this.emit(false);
 }
 private emit(broadcast=true){
  for(const fn of this.listeners){try{fn();}catch{}}
  if(broadcast)this.channel?.postMessage('changed');
 }
 subscribe(fn:()=>void){this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};}
 close(){this.channel?.close();this.listeners.clear();this.db.close();}
 get lockName(){return 'tvp-offline:'+this.db.name;}
 async putSnapshot(s:OfflineScope,k:string,value:unknown){
  valid(s);const tx=this.db.transaction('snapshots','readwrite',{durability:'strict'});
  void tx.done.catch(()=>{});
  try{await tx.store.put(value,key(s,k));await tx.done;this.emit();}catch(e){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw e;}
 }
 async getSnapshot<T>(s:OfflineScope,k:string):Promise<T|undefined>{valid(s);return this.db.get('snapshots',key(s,k)) as Promise<T|undefined>;}
 async enqueue(s:OfflineScope,input:EventInput,blobs:Record<string,Blob>={}){
  valid(s);const id=input.id??crypto.randomUUID();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new Error('UUID required');
  const blobFingerprints=await fingerprintBlobs(blobs);
  const existing=await this.getEvent(s,id);
  if(existing)return this.matchExisting(s,existing,input,blobs);
  const tx=this.db.transaction(['events','blobs','counters'],'readwrite',{durability:'strict'});
  void tx.done.catch(()=>{});
  try{
   const seq=((await tx.objectStore('counters').get(s.userId))??0)+1;
   const e:OutboxEvent={...input,...s,schemaVersion:1,blobFingerprints,id,seq,createdAt:Date.now(),attempts:0,nextAttempt:0,state:'pending'};
   await tx.objectStore('events').add(e);
   await tx.objectStore('blobs').add({id,blobs});
   await tx.objectStore('counters').put(seq,s.userId);await tx.done;this.emit();return e;
  }catch(e){try{tx.abort();}catch{}await tx.done.catch(()=>{});
   if(e instanceof DOMException&&e.name==='ConstraintError'){
    const row=await this.getEvent(s,id);if(row)return this.matchExisting(s,row,input,blobs);
   }throw e;}
 }
 async getEvent(s:OfflineScope,id:string){
  valid(s);const e=await this.db.get('events',id);
  if(e&&!sameOfflineScope(e,s))throw new Error('Scope mismatch');return e;
 }
 private async matchExisting(s:OfflineScope,e:OutboxEvent,input:EventInput,blobs:Record<string,Blob>){
  if(e.bookingId!==input.bookingId||e.kind!==input.kind||canonical(e.payload)!==canonical(input.payload)||
    canonical(e.baseline)!==canonical(input.baseline))throw new Error('UUID immutable input mismatch');
  if(e.blobFingerprints){
   if(canonical(e.blobFingerprints)!==canonical(await fingerprintBlobs(blobs)))throw new Error('UUID immutable blobs mismatch');
   return e;
  }
  const stored=await this.getBlobs(s,e.id);
  if(!await sameBlobs(stored,blobs))throw new Error('UUID immutable blobs mismatch');
  return e;
 }
 async list(s:OfflineScope,options:{includeConfirmed?:boolean}={}){
  valid(s);return (await this.db.getAllFromIndex('events','account',s.userId))
  .filter(e=>e.role===s.role&&(options.includeConfirmed||e.state!=='confirmed')).sort((a,b)=>a.seq-b.seq);
 }
 /** FIFO is global per account, including across role changes. */
 async head(s:OfflineScope){
  valid(s);return (await this.db.getAllFromIndex('events','account',s.userId))
  .filter(e=>e.state!=='confirmed').sort((a,b)=>a.seq-b.seq)[0];
 }
 async getBlobs(s:OfflineScope,id:string){
  const e=await this.db.get('events',id);if(!e||!sameOfflineScope(e,s))throw new Error('Scope mismatch');
  return (await this.db.get('blobs',id))?.blobs??{};
 }
 async lease(s:OfflineScope,owner:string,now:number,ttl:number){
  valid(s);const tx=this.db.transaction('leases','readwrite');const old=await tx.store.get(s.userId);
  if(old&&old.owner!==owner&&old.expiresAt>now){await tx.done;return false;}
  await tx.store.put({userId:s.userId,owner,expiresAt:now+ttl});await tx.done;return true;
 }
 async release(s:OfflineScope,owner:string){
  const tx=this.db.transaction('leases','readwrite');
  if((await tx.store.get(s.userId))?.owner===owner)await tx.store.delete(s.userId);await tx.done;
 }
 async confirmReceipt(s:OfflineScope,id:string,receipt:OfflineReceipt,owner:string,now=Date.now(),snapshots:SnapshotWrite[]=[]){
  return this.transition(s,id,owner,now,{state:'confirmed',receipt,error:undefined},snapshots);
 }
 /** Retry exact head UUID; caller must stop sync first. Never rewrites payload/baseline. */
 async retry(s:OfflineScope,id:string){
  valid(s);const tx=this.db.transaction(['events','leases'],'readwrite',{durability:'strict'});
  void tx.done.catch(()=>{});
  try{
   const lease=await tx.objectStore('leases').get(s.userId);
   if(lease&&lease.expiresAt>Date.now())throw new Error('Stop sync before retry');
   const rows=(await tx.objectStore('events').index('account').getAll(s.userId))
    .filter(e=>e.state!=='confirmed').sort((a,b)=>a.seq-b.seq);
   const e=rows[0];
   if(!e||e.id!==id||!sameOfflineScope(e,s))throw new Error('Only matching head may retry');
   if(e.state==='conflict')throw new Error('Conflict requires explicit resolution or tail discard');
   await tx.objectStore('events').put({...e,state:'pending',nextAttempt:0,error:undefined});
   await tx.done;this.emit();return {...e,state:'pending' as const,nextAttempt:0,error:undefined};
  }catch(e){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw e;}
 }
 async transition(s:OfflineScope,id:string,owner:string,now:number,
 patch:Partial<Pick<OutboxEvent,'state'|'attempts'|'nextAttempt'|'error'|'receipt'>>,snapshots:SnapshotWrite[]=[]){
  const tx=this.db.transaction(['events','blobs','leases','snapshots'],'readwrite',{durability:'strict'});void tx.done.catch(()=>{});
  try{
   const lease=await tx.objectStore('leases').get(s.userId),e=await tx.objectStore('events').get(id);
   if(!lease||lease.owner!==owner||lease.expiresAt<=now)throw new Error('Lease lost');
   if(!e||!sameOfflineScope(e,s))throw new Error('Scope mismatch');
   if(e.state==='confirmed')throw new Error('Already confirmed');
   if(patch.state==='confirmed'&&patch.receipt?.eventId!==id)throw new Error('Receipt mismatch');
   if(snapshots.length&&patch.state!=='confirmed')throw new Error('Snapshots require confirmed receipt');
   for(const snapshot of snapshots)await tx.objectStore('snapshots').put(snapshot.value,key(s,snapshot.key));
   await tx.objectStore('events').put({...e,...patch});
   if(patch.state==='confirmed')await tx.objectStore('blobs').delete(id);await tx.done;this.emit();
  }catch(e){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw e;}
 }
 /** Explicit logout: remove this user's cached data, identity, receipts and counters. Refuses while changes are unsynced or sync is active. */
 async purgeAccount(userId:string){
  if(!userId)throw new Error('Account required');
  const tx=this.db.transaction(['events','blobs','leases','snapshots','counters'],'readwrite',{durability:'strict'});void tx.done.catch(()=>{});
  try{
   const lease=await tx.objectStore('leases').get(userId);
   if(lease&&lease.expiresAt>Date.now())throw new Error('Stop sync before purge');
   const rows=await tx.objectStore('events').index('account').getAll(userId);
   if(rows.some(e=>e.state!=='confirmed'))throw new Error('Unsynced changes remain');
   for(const e of rows){await tx.objectStore('events').delete(e.id);await tx.objectStore('blobs').delete(e.id);}
   const snaps=tx.objectStore('snapshots');
   for(const k of await snaps.getAllKeys()){try{if(JSON.parse(String(k))[0]===userId)await snaps.delete(k);}catch{}}
   await tx.objectStore('counters').delete(userId);await tx.objectStore('leases').delete(userId);
   await tx.done;this.emit();
  }catch(e){try{tx.abort();}catch{}await tx.done.catch(()=>{});throw e;}
 }
 /** Cancel only with explicit confirmation, and discard the entire dependent tail. */
 async discardFrom(s:OfflineScope,seq:number,confirmed:boolean){
  valid(s);if(confirmed!==true)throw new Error('Explicit confirmation required');
  const tx=this.db.transaction(['events','blobs','leases'],'readwrite',{durability:'strict'});
  const lease=await tx.objectStore('leases').get(s.userId);
  if(lease&&lease.expiresAt>Date.now()){await tx.done;throw new Error('Stop sync before discarding');}
  const rows=(await tx.objectStore('events').index('account').getAll(s.userId)).filter(e=>e.seq>=seq&&e.state!=='confirmed');
  if(rows.some(e=>e.role!==s.role)){await tx.done;throw new Error('Tail contains another role');}
  for(const e of rows){await tx.objectStore('events').delete(e.id);await tx.objectStore('blobs').delete(e.id);}await tx.done;this.emit();
 }
}
export async function requestOfflinePersistence(){try{return await navigator.storage?.persist?.()??false;}catch{return false;}}
