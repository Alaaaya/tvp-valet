import { type OfflineStore, type OfflineScope, type OutboxEvent, type OfflineReceipt, sameOfflineScope, type SnapshotWrite } from './offline-store';
export type SyncFailure='conflict'|'permanent'|'auth'|'network'|'uncertain';
export class OfflineSyncError extends Error {
 constructor(public category:SyncFailure,message:string){super(message);}
}
export interface OfflineSyncOptions {
 scope:OfflineScope;
 currentScope:()=>OfflineScope|null;
 /** Must validate server-side session/user/role, not just cached session. */
 validateAuth:(scope:OfflineScope,signal:AbortSignal)=>Promise<boolean>;
 /** Server must dedupe event.id. A lease cannot prevent overlap during suspended tabs/network partitions. */
 execute:(event:OutboxEvent,blobs:Record<string,Blob>,signal:AbortSignal)=>Promise<OfflineReceipt>;
 canonicalSnapshots?:(event:OutboxEvent,receipt:OfflineReceipt)=>SnapshotWrite[];
 classify?:(error:unknown)=>SyncFailure;
 now?:()=>number;
 leaseTtl?:number;
}
export interface SyncResult { reason:'empty'|'busy'|'blocked'|'backoff'|'auth'|'stopped'; nextAttempt?:number }
export class OfflineSync {
 private controller:AbortController|null=null;
 private owner=crypto.randomUUID();
 constructor(private store:OfflineStore,private options:OfflineSyncOptions){}
 stop(){this.controller?.abort();}
 async run():Promise<SyncResult>{
  if(this.controller||this.requesting)return {reason:'busy'};
  this.requesting=true;
  try{
   const locks=typeof navigator!=='undefined'?navigator.locks:undefined;
   if(locks)return await locks.request(this.store.lockName+':'+this.options.scope.userId,
    {mode:'exclusive',ifAvailable:true},lock=>lock?this.drain():Promise.resolve({reason:'busy' as const}));
   return await this.drain();
  }finally{this.requesting=false;}
 }
 private requesting=false;
 private async drain():Promise<SyncResult>{
  if(this.controller)return {reason:'busy'};
  const o=this.options,s=o.scope,now=o.now??Date.now,ttl=Math.max(3000,o.leaseTtl??15000);
  const c=new AbortController();this.controller=c;
  const active=()=>!c.signal.aborted&&sameOfflineScope(o.currentScope(),s);
  let acquired=false;
  let timer:ReturnType<typeof setInterval>|undefined;
  let renewal:Promise<void>|null=null;
  try{
   if(!active())return {reason:'auth'};
   acquired=await this.store.lease(s,this.owner,now(),ttl);
   if(!acquired)return {reason:'busy'};
   timer=setInterval(()=>{
    if(!active()){c.abort();return;}
    if(renewal)return;
    renewal=this.store.lease(s,this.owner,now(),ttl).then(ok=>{if(!ok)c.abort();},()=>c.abort()).finally(()=>{renewal=null;});
   },Math.floor(ttl/3));
   while(active()){
    const event=await this.store.head(s);
    if(!event)return {reason:'empty'};
    if(!sameOfflineScope(event,s)||event.state==='conflict'||event.state==='failed'||event.schemaVersion!==1)return {reason:'blocked'};
    if(event.nextAttempt>now())return {reason:'backoff',nextAttempt:event.nextAttempt};
    try{
     if(!await o.validateAuth(s,c.signal)||!active())return {reason:'auth'};
     await this.store.transition(s,event.id,this.owner,now(),{state:'sending',attempts:event.attempts+1});
     const blobs=await this.store.getBlobs(s,event.id);
     if(!active())return {reason:'stopped'};
     const receipt=await o.execute({...event,state:'sending',attempts:event.attempts+1},blobs,c.signal);
     // Never acknowledge locally after account switching; retry same UUID next session.
     if(!active())return {reason:'stopped'};
     if(receipt.eventId!==event.id)throw new OfflineSyncError('uncertain','Receipt mismatch');
     await this.store.confirmReceipt(s,event.id,receipt,this.owner,now(),o.canonicalSnapshots?.(event,receipt)??[]);
    }catch(error){
     if(!active())return {reason:'stopped'};
     const category=o.classify?.(error)??(error instanceof OfflineSyncError?error.category:'uncertain');
     const nextAttempt=now()+Math.min(300000,1000*2**Math.min(event.attempts,9));
     await this.store.transition(s,event.id,this.owner,now(),{
      state:category==='conflict'?'conflict':category==='permanent'?'failed':'pending',
      nextAttempt,error:error instanceof Error?error.message:String(error)
     });
     if(category==='auth')return {reason:'auth'};
     return {reason:category==='conflict'||category==='permanent'?'blocked':'backoff',nextAttempt};
    }
   }
   return {reason:'stopped'};
  }finally{
   if(timer)clearInterval(timer);
   // Do not release while a queued renewal could reacquire our lease.
   c.abort();
   if(renewal)await renewal;
   if(acquired)await this.store.release(s,this.owner);
   this.controller=null;
  }
 }
}
