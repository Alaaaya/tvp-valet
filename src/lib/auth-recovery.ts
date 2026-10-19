import {t as tr} from './i18n';
/** Minimal auth surface keeps recovery independently testable. */
export interface RecoveryAuth {
  refreshSession(): Promise<{data:{session:{access_token:string}|null};error:unknown}>;
  getSession(): Promise<{data:{session:{access_token:string}|null};error:unknown}>;
  signOut?(opts?:{scope?:'local'|'global'|'others'}):Promise<unknown>;
}
/** Refresh credentials are definitively unusable: user must sign in again. */
export class TerminalSessionError extends Error {constructor(){super(tr("Sitzung abgelaufen. Bitte erneut anmelden."));this.name='TerminalSessionError'}}
/** Temporary failure (network/5xx): keep the session, retry later. */
export class TransientSessionError extends Error {constructor(){super(tr("Sitzung konnte gerade nicht erneuert werden. Bitte Verbindung prüfen."));this.name='TransientSessionError'}}
function terminalRefreshError(e:unknown):boolean{
  if(!e||typeof e!=='object')return false;
  const x=e as {status?:number;code?:string;name?:string;message?:string};
  if(x.name==='AuthRetryableFetchError')return false;
  if(typeof x.status==='number'&&x.status>=500)return false;
  if(/refresh_token_(not_found|already_used)|session_(not_found|expired)/i.test(x.code||''))return true;
  if(/invalid refresh token|refresh token (not found|revoked|already used)|session.*(missing|revoked)/i.test(x.message||''))return true;
  return typeof x.status==='number'&&[400,401,403].includes(x.status)&&x.name==='AuthApiError';
}
const pending = new WeakMap<RecoveryAuth,Promise<string>>();
const recovered = new WeakMap<RecoveryAuth,{failed:string;token:string;at:number}>();

/** Refresh first, fall back to the SDK's current session after a rotation race. */
export function refreshSessionSafely(auth:RecoveryAuth, failedToken?:string):Promise<string> {
  const active=pending.get(auth);
  if(active)return active;
  const prior=recovered.get(auth);
  if(failedToken&&prior?.failed===failedToken&&Date.now()-prior.at<10000){
    // Delayed failures must not resurrect a bearer after logout/account switch.
    return auth.getSession().then(current=>{
      if(current.error)throw new TransientSessionError();
      if(current.data.session?.access_token!==prior.token){
        recovered.delete(auth);
        throw new TransientSessionError();
      }
      return prior.token;
    });
  }
  const promise=(async()=>{
    let token:string|undefined,terminal=false,transient=false;
    try {
      const result=await auth.refreshSession();
      if(result.error){if(terminalRefreshError(result.error))terminal=true;else transient=true}
      else token=result.data.session?.access_token;
    } catch { transient=true; /* network failure, or a sibling tab already rotated */ }
    if(!token){
      let current:Awaited<ReturnType<RecoveryAuth['getSession']>>|undefined;
      try {current=await auth.getSession()} catch {transient=true}
      if(current){
        if(current.error)transient=true;
        else{
          token=current.data.session?.access_token;
          // Replaying the same rejected JWT cannot recover an expired session.
          if(token===failedToken)token=undefined;
          if(!current.data.session&&!transient)terminal=true;
        }
      }
    }
    if(!token){
      if(terminal&&!transient){
        try {await auth.signOut?.({scope:'local'})} catch { /* local only */ }
        throw new TerminalSessionError();
      }
      throw new TransientSessionError();
    }
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
    headers.set('Authorization',tr("Bearer ")+token);
    return fetcher(new Request(replay,{headers}));
  };
}
