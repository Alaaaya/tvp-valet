import type {PendingMedia} from './handover-api';
export type UpStatus='queued'|'uploading'|'done'|'failed';
export type UpItem={id:string;status:UpStatus;error?:string};
export const MAX_BATCH=40;
/** Uploads items sequentially. Items already done are never uploaded again (retry safe). Stops when isAlive() turns false. */
export async function runUploads(items:PendingMedia[],status:Map<string,UpItem>,send:(m:PendingMedia)=>Promise<void>,onChange:(s:Map<string,UpItem>)=>void,isAlive:()=>boolean){
  const inflight=new Set<string>();
  for(const m of items){
    if(!isAlive())return;
    const cur=status.get(m.id);
    if(cur?.status==='done'||inflight.has(m.id))continue;
    inflight.add(m.id);
    status.set(m.id,{id:m.id,status:'uploading'});onChange(new Map(status));
    try{await send(m);status.set(m.id,{id:m.id,status:'done'})}
    catch(e){status.set(m.id,{id:m.id,status:'failed',error:e instanceof Error?e.message:String(e)})}
    inflight.delete(m.id);
    if(!isAlive())return;onChange(new Map(status));
  }
}
export const toFile=(m:PendingMedia)=>new File([m.blob],m.name,{type:m.mime_type});
