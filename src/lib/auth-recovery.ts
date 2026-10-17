/** Minimal auth surface keeps recovery independently testable. */
export interface RecoveryAuth {
  refreshSession(): Promise<{data:{session:{access_token:string}|null};error:unknown}>;
  getSession(): Promise<{data:{session:{access_token:string}|null};error:unknown}>;
}
const pending = new WeakMap<RecoveryAuth,Promise<string>>();
const recovered = new WeakMap<RecoveryAuth,{failed:string;token:string;at:number}>();

/** Refresh first, fall back to the SDK's current session after a rotation race. */
export function refreshSessionSafely(auth:RecoveryAuth, failedToken?:string):Promise<string> {
  const active=pending.get(auth);
  if(active)return active;
  const prior=recovered.get(auth);
  if(failedToken&&prior?.failed===failedToken&&Date.now()-prior.at<10000)return Promise.resolve(prior.token);
  const promise=(async()=>{
    let token:string|undefined;
    try {
      const result=await auth.refreshSession();
      if(!result.error)token=result.data.session?.access_token;
    } catch { /* A sibling tab may already have rotated this refresh token. */ }
    if(!token){
      const current=await auth.getSession();
      if(!current.error)token=current.data.session?.access_token;
      // Replaying the same rejected JWT cannot recover an expired session.
      if(token===failedToken)token=undefined;
    }
    if(!token)throw new Error('Sitzung abgelaufen. Bitte erneut anmelden.');
    if(failedToken)recovered.set(auth,{failed:failedToken,token,at:Date.now()});
    return token;
  })();
  pending.set(auth,promise);
  void promise.finally(()=>{if(pending.get(auth)===promise)pending.delete(auth)}).catch(()=>{});
  return promise;
}

async function authenticationRejected(response:Response):Promise<boolean> {
  if(response.status===401)return true;
  if(![400,403].includes(response.status))return false;
  try {
    const body=await response.clone().json();
    const message=[body.message,body.error,body.msg].filter(x=>typeof x==='string').join(' ');
    return body.code==='PGRST301'||/jwt.*(expired|invalid)|(expired|invalid).*jwt/i.test(message);
  } catch {return false}
}

/**
 * Shared transport covers REST/RPC, Storage and Functions. Never retry network
 * errors, upstream failures or successful writes. Only an auth rejection before
 * execution is replayable; auth endpoints are excluded to avoid recursive refresh.
 */
export function createRecoveringFetch(baseUrl:string, getAuth:()=>RecoveryAuth|null, fetcher:typeof fetch=globalThis.fetch.bind(globalThis)):typeof fetch {
  const base=new URL(baseUrl);
  return async(input,init)=>{
    const request=new Request(input,init);
    const target=new URL(request.url);
    const protectedRequest=target.origin===base.origin&&
      ['/rest/v1/','/functions/v1/','/storage/v1/'].some(p=>target.pathname.startsWith(p));
    if(!protectedRequest)return fetcher(request);
    const replay=request.clone();
    const response=await fetcher(request);
    if(!await authenticationRejected(response))return response;
    const auth=getAuth();
    if(!auth)return response;
    const failedToken=replay.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');
    let token:string;
    try {token=await refreshSessionSafely(auth,failedToken)} catch {return response}
    const headers=new Headers(replay.headers);
    headers.set('Authorization','Bearer '+token);
    return fetcher(new Request(replay,{headers}));
  };
}
