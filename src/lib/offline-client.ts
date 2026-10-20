import {db} from '../api';
import type {Booking,Employee} from '../model';
import type {BookingOperations} from './operations';
import {fetchAllPages} from './global-search';
import {openOfflineStore,requestOfflinePersistence,type OfflineScope,type OutboxEvent,type OfflineStore} from './offline-store';
import {OfflineSync,OfflineSyncError} from './offline-sync';
import {registerOfflineShell} from './offline-shell';
import {t as tr} from './i18n';

export interface OfflineStatus {
 online:boolean;pending:number;syncing:boolean;error:string;events:OutboxEvent[];cacheAt:number|null;cacheCount:number;
 complete:boolean;storagePersistent:boolean;shell:string;ready:boolean;accountId:string|null;
}
type Snapshot={rows:Booking[];staff:Employee[];operations:BookingOperations[];at:number;complete:boolean};
type Baseline={version:number;predecessor:string|null;projected:Booking;projectedOps?:BookingOperations};
let state:OfflineStatus={online:typeof navigator==='undefined'||navigator.onLine,pending:0,syncing:false,error:'',events:[],cacheAt:null,cacheCount:0,complete:false,storagePersistent:false,shell:'installing',ready:false,accountId:null};
let scope:OfflineScope|null=null,employee:Employee|null=null,snapshot:Snapshot={rows:[],staff:[],operations:[],at:0,complete:false};
let shellControl:Awaited<ReturnType<typeof registerOfflineShell>>=null;
export function applyOfflineUpdate(){return shellControl?.applyUpdate()??false}
let unsubscribeStore:(()=>void)|undefined;
let canonicalSnapshot:Snapshot={rows:[],staff:[],operations:[],at:0,complete:false};
let storePromise:Promise<OfflineStore>|undefined,sync:OfflineSync|null=null,running:Promise<void>|null=null,epoch=0,timer:ReturnType<typeof setTimeout>|undefined,started=false;
const listeners=new Set<()=>void>();
const store=()=>storePromise??=openOfflineStore();
export const offlineSnapshot=()=>state;
export function subscribeOffline(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
function emit(patch:Partial<OfflineStatus>={}){state={...state,...patch};for(const l of listeners)l()}
function assertScope(s:OfflineScope,gen:number){if(gen!==epoch||scope?.userId!==s.userId||scope?.role!==s.role)throw new OfflineSyncError('auth',tr("Sitzung abgelaufen. Bitte erneut anmelden."))}
export async function pendingOfflineMedia(bookingId:string){
 const s=scope,gen=epoch;if(!s)return [];
 const st=await store();const events=await st.list(s);assertScope(s,gen);
 const result:{item:{id:string;path:string;kind:'photo'|'video'|'signature';mime_type:string;captured_at:string;size_bytes:number;action?:'in'|'out'};blob:Blob}[]=[];
 for(const e of events){if(e.bookingId!==bookingId||!['handover','media_append'].includes(e.kind))continue;
  const payload=e.payload as {media?:{id:string;path:string;kind:'photo'|'video'|'signature';mime_type:string;captured_at:string;size_bytes:number}[];action?:'in'|'out'};
  const blobs=await st.getBlobs(s,e.id);assertScope(s,gen);
  for(const item of payload.media??[]){const blob=blobs[item.id]??blobs[item.path];if(blob)result.push({item:{...item,action:payload.action},blob})}
 }
 return result;
}
export function cachedOfflineBookings(){return snapshot.rows}
export function cachedOfflineBooking(id:string){return snapshot.rows.find(b=>b.id===id)}
export function cachedOfflineOperations(id:string){return snapshot.operations.find(b=>b.booking_id===id)}
function normalize(row:Booking&{booking_handover_undos?:{count:number}[]}):Booking{
 const {booking_handover_undos,...b}=row;
 return {...b,lifecycle_revision:booking_handover_undos?.[0]?.count??row.lifecycle_revision??0,...Object.fromEntries(['external_id','phone','email','plate','product','flight_in','flight_out','key_cash','spot','comment'].map(k=>[k,row[k as keyof Booking]??'']))} as Booking;
}
function overlay(rows:Booking[],ops:BookingOperations[],events:OutboxEvent[]){
 const r=new Map(rows.map(b=>[b.id,b])),o=new Map(ops.map(b=>[b.booking_id,b]));
 for(const e of events){
  const base=e.baseline as Baseline;
  if(e.state==='confirmed'){
   const receipt=e.receipt as {booking?:Booking;operations?:BookingOperations;lifecycle_revision?:number}|undefined;
   if(receipt?.booking && (receipt.booking.sync_version??-1)>=(r.get(e.bookingId)?.sync_version??-1)){r.set(e.bookingId,normalize({...receipt.booking,lifecycle_revision:receipt.lifecycle_revision??receipt.booking.lifecycle_revision}));if(receipt.operations)o.set(e.bookingId,receipt.operations);}

  }else if(base?.projected){
   r.set(e.bookingId,{...base.projected,offline_pending:true});
   if(base.projectedOps)o.set(e.bookingId,base.projectedOps);
  }
 }
 return {rows:[...r.values()],operations:[...o.values()]};
}
async function hydrate(s:OfflineScope,gen:number){
 const st=await store(),events=await st.list(s,{includeConfirmed:true});assertScope(s,gen);
 const canonical=await st.getSnapshot<Snapshot>(s,'data')??{rows:[],staff:employee?[employee]:[],operations:[],at:0,complete:false};assertScope(s,gen);
 canonicalSnapshot=canonical;
 const projected=overlay(canonical.rows,canonical.operations,events);snapshot={...canonical,...projected};
 emit({events:events.filter(e=>e.state!=='confirmed'),pending:events.filter(e=>e.state!=='confirmed').length,cacheAt:snapshot.at||null,cacheCount:snapshot.rows.length,complete:snapshot.complete});
}
export async function offlineAccountFor(uid:string):Promise<Employee|null>{
 try{return await (await store()).getSnapshot<Employee>({userId:uid,role:'identity'},'self')??null}catch{return null}
}
export async function startOfflineAccount(me:Employee|null){
 const key=me?me.id+':'+me.role:null;
 if(state.ready&&key===(scope?scope.userId+':'+scope.role:null))return;
 ++epoch;unsubscribeStore?.();unsubscribeStore=undefined;sync?.stop();sync=null;clearTimeout(timer);employee=me;scope=me?{userId:me.id,role:me.role}:null;
 const gen=epoch,s=scope;snapshot={rows:[],staff:[],operations:[],at:0,complete:false};canonicalSnapshot=snapshot;
 emit({ready:false,accountId:me?.id??null,pending:0,events:[],cacheCount:0,cacheAt:null,error:'',complete:false,syncing:false});
 if(!s){emit({ready:true});return}
 try{
  const st=await store();assertScope(s,gen);
  snapshot=await st.getSnapshot<Snapshot>(s,'data')??snapshot;assertScope(s,gen);
  await st.putSnapshot({userId:s.userId,role:'identity'},'self',me);
  await hydrate(s,gen);assertScope(s,gen);emit({ready:true});
  unsubscribeStore=st.subscribe(()=>{void hydrate(s,gen).catch(()=>{});if(navigator.onLine&&!running)void retryOffline()});
  void requestOfflinePersistence().then(p=>{if(gen===epoch)emit({storagePersistent:p})});
  setup();void retryOffline();
 }catch(error){if(gen===epoch)emit({ready:true,error:error instanceof Error?error.message:String(error)})}
}
function setup(){
 if(started||typeof window==='undefined')return;started=true;
 const changed=()=>{emit({online:navigator.onLine});if(navigator.onLine){const wasRunning=running;void retryOffline().finally(()=>{if(wasRunning&&navigator.onLine)void retryOffline()})}};
 window.addEventListener('online',changed);window.addEventListener('offline',changed);
 window.addEventListener('focus',()=>{if(navigator.onLine)void retryOffline()});
 // Any open form blocks version activation, not only a form that has reached the outbox.
 void registerOfflineShell({isBlocked:()=>state.pending>0||state.syncing||!!document.querySelector('form,[role="dialog"],[role="alertdialog"],.modal-backdrop,.ho-flow,.camera-screen,.sign-screen,video,canvas,input[type="file"]')||!!document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'),onState:s=>emit({shell:s})}).then(control=>{shellControl=control});
}
async function onlineIdentity(s:OfflineScope,signal:AbortSignal){
 if(!db||!navigator.onLine)return false;
 const {data,error}=await db.auth.getUser();if(error||data.user?.id!==s.userId)return false;
 const p=await db.from('profiles').select('id,role,active').eq('id',s.userId).abortSignal(signal).maybeSingle();
 return !p.error&&p.data?.active===true&&p.data.role===s.role;
}
function classify(error:unknown){
 if(error instanceof OfflineSyncError)return error.category;
 const e=error as {code?:string;status?:number;message?:string};
 if(e.code==='PT409'||e.code==='40001')return 'conflict' as const;
 if(e.status===401||e.code==='PGRST301'||e.code==='42501')return 'auth' as const;
 if(e.code&&(/^(22|23)/.test(e.code)||e.code==='P0002'))return 'permanent' as const;
 return 'uncertain' as const;
}
async function execute(event:OutboxEvent,blobs:Record<string,Blob>,signal:AbortSignal){
 if(!db)throw new OfflineSyncError('auth','Backend unavailable');
 const s={userId:event.userId,role:event.role},gen=epoch;assertScope(s,gen);
 const base=event.baseline as Baseline,payload=event.payload as Record<string,unknown>;
 // Immutable storage object names are event-scoped, so replay never overwrites another capture.
 const media=(payload.media??[]) as {id:string;path:string;mime_type:string;size_bytes:number}[];
 for(const m of media){
  if(!m.path.startsWith(event.bookingId+'/'+event.id+'-'))throw new OfflineSyncError('permanent','Invalid offline media path');
  const blob=blobs[m.path]??blobs[m.id];if(!blob)throw new OfflineSyncError('permanent','Offline media missing');
  assertScope(s,gen);if(signal.aborted)throw new DOMException('aborted','AbortError');
  const bucket=db.storage.from('booking-media'),r=await bucket.upload(m.path,blob,{contentType:m.mime_type,upsert:false,cacheControl:'0'});
  if(r.error){
   const name=m.path.slice(event.bookingId.length+1),existing=await bucket.list(event.bookingId,{search:name,limit:100});
   const match=existing.data?.find(x=>x.name===name&&Number(x.metadata?.size)===blob.size&&x.metadata?.mimetype===m.mime_type);
   if(existing.error||!match)throw r.error;
  }
 }
 assertScope(s,gen);if(signal.aborted)throw new DOMException('aborted','AbortError');
 const result=await db.rpc('sync_booking_event',{p_event_id:event.id,p_booking_id:event.bookingId,p_expected_version:base.version,p_action:event.kind,p_payload:payload,p_predecessor_id:base.predecessor}).abortSignal(signal);
 if(result.error)throw result.error;
 if(!result.data||result.data.event_id!==event.id||result.data.booking_id!==event.bookingId||!result.data.booking||!Number.isSafeInteger(result.data.version))throw new OfflineSyncError('uncertain','Invalid sync receipt');
 return {...result.data,eventId:event.id};
}
export async function retryOffline(manual=false):Promise<void>{
 if(running)return running;
 const s=scope,gen=epoch;if(!s||!state.ready||!state.online)return;
 running=(async()=>{
  try{
   const st=await store();assertScope(s,gen);emit({syncing:true,error:''});
   if(manual){const head=await st.head(s);if(head?.state==='failed'||(head?.state==='pending'&&head.nextAttempt>Date.now()))await st.retry(s,head.id)}
   sync=new OfflineSync(st,{scope:s,currentScope:()=>scope,validateAuth:onlineIdentity,execute,classify,canonicalSnapshots:(_event,receipt)=>{
    const b=receipt.booking as Booking,ops=receipt.operations as BookingOperations|null;
    const canonical=canonicalSnapshot;
    const rows=new Map(canonical.rows.map(x=>[x.id,x]));rows.set(b.id,normalize({...b,lifecycle_revision:receipt.lifecycle_revision as number}));
    const operations=new Map(canonical.operations.map(x=>[x.booking_id,x]));if(ops)operations.set(ops.booking_id,ops);
    canonicalSnapshot={...canonical,rows:[...rows.values()],operations:[...operations.values()]};
    return [{key:'data',value:canonicalSnapshot}];
   }});
   const result=await sync.run();assertScope(s,gen);await hydrate(s,gen);
   if(result.reason==='auth')emit({error:tr("Sitzung abgelaufen. Bitte erneut anmelden.")});
   if(result.reason==='backoff'||result.reason==='busy'){clearTimeout(timer);timer=setTimeout(()=>{void retryOffline()},Math.max(1000,(result.nextAttempt??Date.now()+4000)-Date.now()))}
  }catch(error){if(gen===epoch)emit({error:error instanceof Error?error.message:String(error)})}
  finally{if(gen===epoch){emit({syncing:false});sync=null}running=null;if(gen!==epoch&&scope&&state.ready&&state.online)void retryOffline()}
 })();return running;
}
export async function discardOfflineFrom(sequence:number,confirmed:boolean){
 const s=scope,gen=epoch;if(!s)throw Error('No account');
 sync?.stop();if(running)await running;assertScope(s,gen);
 const st=await store();await st.discardFrom(s,sequence,confirmed);assertScope(s,gen);
 snapshot=await st.getSnapshot<Snapshot>(s,'data')??{rows:[],staff:employee?[employee]:[],operations:[],at:0,complete:false};
 await hydrate(s,gen);
}
export interface EnqueueOfflineInput {id?:string;booking:Booking;kind:string;payload:Record<string,unknown>;projected:Booking;projectedOps?:BookingOperations;blobs?:Record<string,Blob>}
export async function enqueueOffline(input:EnqueueOfflineInput){
 const s=scope,gen=epoch;
 if(!s||!state.ready||!employee)throw Error(tr("Sitzung abgelaufen. Bitte erneut anmelden."));
 const st=await store();assertScope(s,gen);
 if(!Number.isSafeInteger(input.booking.sync_version)||(input.booking.sync_version??-1)<0)throw Error('Offline sync is not available for this booking yet. Reload online first.');
 const events=await st.list(s,{includeConfirmed:true});assertScope(s,gen);
 const existing=input.id?events.find(e=>e.id===input.id):undefined;
 if(existing){
  if(existing.kind!==input.kind||existing.bookingId!==input.booking.id||JSON.stringify(existing.payload)!==JSON.stringify(input.payload))throw Error('Offline request changed. Reopen the booking.');
  await st.enqueue(s,{id:existing.id,bookingId:existing.bookingId,kind:existing.kind,payload:input.payload,baseline:existing.baseline},input.blobs??{});assertScope(s,gen);await hydrate(s,gen);void retryOffline();
  return {booking:cachedOfflineBooking(input.booking.id)??input.projected,operations:cachedOfflineOperations(input.booking.id),eventId:existing.id};
 }
 const previous=events.filter(e=>e.bookingId===input.booking.id).at(-1);
 if(events.some(e=>e.state==='conflict'||e.state==='failed'))throw Error('Review the blocked sync queue before saving more changes.');
 const projected={...input.projected,offline_pending:true};
 const event=await st.enqueue(s,{id:input.id,bookingId:input.booking.id,kind:input.kind,payload:input.payload,baseline:{version:input.booking.sync_version!,predecessor:previous?.id??null,projected,projectedOps:input.projectedOps} satisfies Baseline},input.blobs??{});
 assertScope(s,gen);await hydrate(s,gen);void retryOffline();
 return {booking:cachedOfflineBooking(input.booking.id)??projected,operations:input.projectedOps,eventId:event.id};
}
export async function offlineLoad(signal?:AbortSignal):Promise<{rows:Booking[];staff:Employee[]}>{
 const s=scope,gen=epoch;if(!s)throw Error('No offline account');
 if(navigator.onLine&&db){
  try{
   const ctl=signal??new AbortController().signal;
   const rows=await fetchAllPages<Booking>(async(from,to,abort)=>{
    const r=await db!.from('bookings').select('*,booking_handover_undos(count)').order('arrival_at').order('id').range(from,to).abortSignal(abort);
    if(r.error)throw r.error;return (r.data??[]).map(normalize);
   },ctl);
   const profiles=await db.from('profiles').select('id,full_name,role,active').abortSignal(ctl);if(profiles.error)throw profiles.error;
   const operations=await fetchAllPages<BookingOperations>(async(from,to,abort)=>{const r=await db!.from('booking_operations').select('*').order('booking_id').range(from,to).abortSignal(abort);if(r.error)throw r.error;return r.data??[]},ctl);
   assertScope(s,gen);
   const next:Snapshot={rows,staff:(profiles.data??[]).filter(x=>x.active).map(({id,full_name,role})=>({id,full_name,role})),operations,at:Date.now(),complete:true};
   // Persist server state, never a projection. Pending events are applied on read/reload.
   await (await store()).putSnapshot(s,'data',next);assertScope(s,gen);snapshot=next;await hydrate(s,gen);emit({error:''});
  }catch(error){
   if(signal?.aborted)throw error;assertScope(s,gen);
   if(!snapshot.at)throw error;emit({error:error instanceof Error?error.message:String(error)});
  }
 }else if(!snapshot.at)throw Error('No cached bookings. Open the app online first.');
 assertScope(s,gen);return {rows:snapshot.rows,staff:snapshot.staff};
}
export async function offlineLoadOperations(){return snapshot.operations}
