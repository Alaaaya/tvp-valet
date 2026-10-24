// Same-project Edge handler. No external server, credentials file, domain or test flags.
// verify_jwt=false supports asymmetric signing keys; Auth /user verifies every request.
const ORIGIN=Deno.env.get('SUPABASE_URL');
const config={anon:Deno.env.get('SUPABASE_ANON_KEY'),service_role:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')};
if(!ORIGIN||!config.anon||!config.service_role)throw Error('Missing integrated Supabase environment');
const allowedOrigins=new Set(['https://alaaaya.github.io',ORIGIN]);
const headers={apikey:config.anon,'Content-Type':'application/json'};
async function request(path,token,{method='POST',body}={}){
 const r=await fetch(ORIGIN+path,{method,redirect:'error',headers:{...headers,Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 let data;try{data=await r.json()}catch{data=null}
 return {ok:r.ok,status:r.status,data};
}
async function rpc(name,args,token=config.service_role){
 const r=await request('/rest/v1/rpc/'+name,token,{body:args});if(!r.ok){const e=Error('RPC rejected');e.code=r.data?.code||'rpc_error';e.status=r.status;throw e}return r.data;
}
async function processDelete(body,jwt){
 // Auth endpoint verifies signature, expiry, audience. No actor supplied by caller.
 const user=await request('/auth/v1/user',jwt,{method:'GET'});
 if(!user.ok||!user.data?.id)return {status:401,data:{status:'forbidden'}};
 const actor=user.data.id;
 // Confirmation RPC checks current profile admin, matching immutable actor and exact request context.
 let intent;try{intent=await rpc('admin_confirm_media_delete_v4',body,jwt)}
 catch(e){return {status:e.status||403,data:{status:'confirmation_rejected',code:e.code}}}
 const attempt=crypto.randomUUID();
 let capability;
 try{capability=await rpc('prepare_media_delete_service_v4',{p_request_id:body.p_request_id,p_attempt_id:attempt,p_verified_actor:actor})}
 catch(e){return {status:409,data:{request_id:intent.request_id,deleted:true,status:'removal_pending',code:e.code}}}
 const args={p_request_id:body.p_request_id,p_attempt_id:attempt};
 const record=(state,code=null)=>rpc('record_media_delete_attempt_v4',{...args,p_state:state,p_error_code:code});
 try{
  // Real service-role Storage HTTP path, lease authorization enforced by SQL trigger.
  const remove=await request('/storage/v1/object/booking-media',config.service_role,{method:'DELETE',body:{prefixes:[capability.path]}});
  if(!remove.ok){await record('storage_http_failure','storage_error');return {status:502,data:{request_id:intent.request_id,deleted:true,status:'removal_pending',code:'storage_error'}}}
  await record('storage_http_success');
  // Authenticate using service role. Accept explicit object-not-found only, not 403/network.
  const path=capability.path.split('/').map(encodeURIComponent).join('/');
  const absent=await request('/storage/v1/object/authenticated/booking-media/'+path,config.service_role,{method:'GET'});
  const missing=!absent.ok&&(absent.status===404||String(absent.data?.statusCode)==='404'||absent.data?.error==='not_found');
  if(!missing){await record('reconciliation_failure','api_absence_not_established');return {status:502,data:{request_id:intent.request_id,deleted:true,status:'removal_pending',code:'api_absence_not_established'}}}
  try{await rpc('record_media_storage_absence_v4',{p_request_id:intent.request_id,p_observation_id:crypto.randomUUID(),p_observed_at:new Date().toISOString(),p_http_status:404})}
  catch{await record('reconciliation_failure','metadata_not_removed');return {status:502,data:{request_id:intent.request_id,deleted:true,status:'removal_pending',code:'metadata_not_removed'}}}
  await record('api_absence_observed');
  return {status:200,data:{request_id:intent.request_id,deleted:true,status:'api_absence_observed',bytes_erasure_verified:false}};
 }catch{
  // Separate transaction records bounded failure, not raw exception/JWT/path.
  try{await record('storage_http_failure','network_error')}catch{}
  return {status:502,data:{request_id:intent.request_id,deleted:true,status:'removal_pending',code:'network_error'}};
 }
}

Deno.serve(async(req)=>{
 const origin=req.headers.get('Origin');
 const cors={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 if(origin&&!allowedOrigins.has(origin))return new Response(null,{status:403,headers:cors});
 if(origin)cors['Access-Control-Allow-Origin']=origin;
 const reply=(status,data)=>new Response(data===null?null:JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'authorization, content-type, apikey, x-client-info'}});
 if(req.method!=='POST')return reply(405,{status:'method_not_allowed'});
 const auth=req.headers.get('Authorization');
 if(!auth?.startsWith('Bearer ')||auth.length>8192)return reply(401,{status:'forbidden'});
 try{
  // Bound streamed input, including when Content-Length is absent.
  const reader=req.body?.getReader();let size=0;const chunks=[];
  if(!reader)return reply(400,{status:'invalid_request'});
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return reply(413,{status:'invalid_request'})}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  let body;try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{return reply(400,{status:'invalid_request'})}
  const keys=['p_request_id','p_booking_id','p_object_id','p_path','p_confirmed','p_reason'];
  if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length!==keys.length||keys.some(k=>!(k in body)))return reply(400,{status:'invalid_request'});
  const result=await processDelete(body,auth.slice(7));
  return reply(result.status,result.data);
 }catch{return reply(503,{status:'unavailable'})}
});
