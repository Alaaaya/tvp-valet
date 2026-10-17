/** Keep the SDK's persisted session authoritative, including after a suspended tab resumes. */
export interface StoredSession { user: {id:string}; access_token?:string }
interface SessionAuth {
  getSession():Promise<{data:{session:StoredSession|null};error:unknown}>;
  onAuthStateChange(callback:(event:string,session:StoredSession|null)=>void):{data:{subscription:{unsubscribe():void}}};
}
export function observeSession(
  auth:SessionAuth,
  onSession:(session:StoredSession|null)=>void,
  onError:(error:Error)=>void,
  win:Pick<Window,'addEventListener'|'removeEventListener'>=window,
  doc:Pick<Document,'visibilityState'|'addEventListener'|'removeEventListener'>=document,
):()=>void {
  let disposed=false,revision=0,inflight=false,attempt=0;
  let last:string|undefined,retry:ReturnType<typeof setTimeout>|undefined;
  const deferred=new Set<ReturnType<typeof setTimeout>>();
  const deliver=(session:StoredSession|null)=>{
    if(disposed)return;
    const key=session?session.user.id+'|'+(session.access_token||''):'signed-out';
    if(key===last)return;
    last=key;onSession(session);
  };
  const read=async()=>{
    if(disposed||inflight)return;
    inflight=true;const started=revision;
    try {
      const {data,error}=await auth.getSession();
      if(disposed||started!==revision)return;
      if(error)throw error;
      attempt=0;deliver(data.session);
    } catch {
      if(disposed||started!==revision)return;
      // A network/storage error isn't a logout. Never remove SDK credentials here.
      onError(new Error('Sitzung konnte gerade nicht geladen werden. Bitte Verbindung prüfen.'));
      if(attempt<3)retry=setTimeout(()=>{retry=undefined;void read()},1000*2**attempt++);
    } finally {inflight=false}
  };
  const {data}=auth.onAuthStateChange((event,session)=>{
    if(!['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED','USER_UPDATED'].includes(event))return;
    if(!session&&event!=='INITIAL_SESSION'&&event!=='SIGNED_OUT')return;
    revision++;
    // Do not invoke Supabase queries inside its auth lock/event callback.
    const timer=setTimeout(()=>{deferred.delete(timer);deliver(session)},0);
    deferred.add(timer);
  });
  const wake=()=>{if(doc.visibilityState==='visible'){if(retry){clearTimeout(retry);retry=undefined}void read()}};
  win.addEventListener('focus',wake);win.addEventListener('online',wake);win.addEventListener('pageshow',wake);
  doc.addEventListener('visibilitychange',wake);
  void read();
  return()=>{disposed=true;data.subscription.unsubscribe();if(retry)clearTimeout(retry);for(const timer of deferred)clearTimeout(timer);win.removeEventListener('focus',wake);win.removeEventListener('online',wake);win.removeEventListener('pageshow',wake);doc.removeEventListener('visibilitychange',wake)};
}
