import {t as tr} from './i18n';
import {db} from '../api';
import type {Booking} from '../model';
export type MediaKind='photo'|'video'|'signature';
export type PendingMedia={id:string;blob:Blob;kind:MediaKind;mime_type:string;captured_at:string;name:string};
export type MediaItem={id:string;path:string;kind:MediaKind;mime_type:string;captured_at:string;size_bytes:number;bucket?:string;local_blob?:Blob;offline_pending?:boolean;action?:'in'|'out';undone_at?:string|null;undone_by?:string|null};
export type HandoverDetails={km:number|null;key_cash:string;flight_number:string;comment:string;poor_visibility:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const imageTypes=new Set(['image/jpeg','image/png','image/webp']),videoTypes=new Set(['video/mp4','video/webm','video/quicktime']);
const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
export function baseMime(type:string){return type.toLowerCase().split(';')[0].trim()}
export function validateMedia(blob:Blob,kind:MediaKind){
 const type=baseMime(blob.type);
 if(kind==='signature'?type!=='image/png':kind==='photo'?!imageTypes.has(type):!videoTypes.has(type))throw Error(tr("Dieses Medienformat wird nicht unterstützt. Bitte JPEG, PNG, WebP, MP4 oder WebM wählen."));
 if(!blob.size||blob.size>(kind==='video'?50:10)*1024*1024)throw Error(kind==='video'?tr("Video muss zwischen 1 Byte und 50 MB groß sein."):tr("Bild muss zwischen 1 Byte und 10 MB groß sein."));
 return type;
}
export function createPendingMedia(blob:Blob,kind:MediaKind,name?:string,capturedAt=new Date().toISOString()):PendingMedia{
 const mime_type=validateMedia(blob,kind);
 if(!Number.isFinite(Date.parse(capturedAt))||Date.parse(capturedAt)>Date.now()+300000)throw Error(tr("Ungültige Aufnahmezeit."));
 return{id:crypto.randomUUID(),blob,kind,mime_type,captured_at:capturedAt,name:name||kind+'.'+extensions[mime_type]};
}
export function mediaPath(bookingId:string,requestId:string,item:PendingMedia){
 if(!uuid.test(bookingId)||!uuid.test(requestId)||!uuid.test(item.id))throw Error(tr("Ungültige Medienzuordnung."));
 return bookingId+'/'+requestId+'-'+item.id+'.'+extensions[validateMedia(item.blob,item.kind)];
}
function client(){if(!db)throw Error(tr("Backend nicht eingerichtet."));return db}
function normalizeBooking(row:Booking):Booking{return{...row,...Object.fromEntries(['external_id','phone','email','plate','product','flight_in','flight_out','key_cash','spot','comment'].map(k=>[k,row[k as keyof Booking]??'']))}}
export function validateHandover(details:HandoverDetails,media:PendingMedia[]){
 if(details.km!==null&&(!Number.isInteger(details.km)||details.km<0||details.km>2147483647))throw Error(tr("Kilometerstand muss eine positive ganze Zahl sein."));
 if(details.key_cash.length>200||details.flight_number.length>40||details.comment.length>10000)throw Error(tr("Ein Eingabefeld ist zu lang."));
 if(media.filter(x=>x.kind!=='signature').length>40||media.filter(x=>x.kind==='signature').length>1)throw Error(tr("Maximal 40 Aufnahmen und eine Unterschrift pro Übergabe."));
 if(new Set(media.map(x=>x.id)).size!==media.length)throw Error(tr("Doppelte Medienzuordnung."));
 for(const item of media){validateMedia(item.blob,item.kind);if(baseMime(item.blob.type)!==item.mime_type||!Number.isFinite(Date.parse(item.captured_at)))throw Error(tr("Ungültige Mediendaten."))}
}
export async function listBookingMedia(bookingId:string):Promise<MediaItem[]>{
 if(!uuid.test(bookingId))throw Error(tr("Ungültige Buchung."));
 const d=client(),result=await d.from('booking_media').select('id,path,kind,mime_type,captured_at,size_bytes,action,booking_handovers!inner(undone_at,undone_by)').eq('booking_id',bookingId).order('captured_at');
 if(result.error)throw result.error;
 const items:MediaItem[]=(result.data||[]).map((row:MediaItem&{booking_handovers?:{undone_at:string|null;undone_by:string|null}|{undone_at:string|null;undone_by:string|null}[]})=>{const {booking_handovers,...item}=row;const history=Array.isArray(booking_handovers)?booking_handovers[0]:booking_handovers;return{...item,undone_at:history?.undone_at||null,undone_by:history?.undone_by||null}});
 const gallery=await d.from('booking_gallery_media').select('*').eq('booking_id',bookingId).order('captured_at');
 // The gallery ledger is optional: tolerate only a known-missing schema, keep legacy data, surface every other error.
 if(gallery.error&&!['PGRST205','42P01'].includes((gallery.error as {code?:string}).code||''))throw gallery.error;
 for(const row of gallery.error?[]:gallery.data||[]){
  if(items.some(x=>x.id===row.id||x.path===row.path))continue;
  items.push({id:row.id,path:row.path,bucket:row.bucket||'booking-media',kind:row.kind,mime_type:row.mime_type,captured_at:row.captured_at,size_bytes:Number(row.size_bytes??row.bytes??0)});
 }
 // Preserve pre-existing photos, but do not publish abandoned partial uploads as completed evidence.
 for(let offset=0;;offset+=100){
  const r=await d.storage.from('booking-media').list(bookingId,{limit:100,offset,sortBy:{column:'created_at',order:'asc'}});
  if(r.error)throw r.error;
  for(const f of r.data||[]){
   const path=bookingId+'/'+f.name,type=baseMime(f.metadata?.mimetype||'');
   if(items.some(x=>x.path===path)||/^[0-9a-f-]{36}-[0-9a-f-]{36}\./i.test(f.name)||(!imageTypes.has(type)&&!videoTypes.has(type)))continue;
   items.push({id:f.id||path,path,kind:videoTypes.has(type)?'video':'photo',mime_type:type,captured_at:f.created_at||'',size_bytes:Number(f.metadata?.size||0)});
  }
  if((r.data?.length||0)<100)break;
 }
 return items.sort((a,b)=>a.captured_at.localeCompare(b.captured_at));
}
export async function signedMediaUrl(item:MediaItem):Promise<string>{
 if(item.local_blob)return URL.createObjectURL(item.local_blob);
 const r=await client().storage.from(item.bucket||'booking-media').createSignedUrl(item.path,300);
 if(r.error||!r.data?.signedUrl)throw r.error||Error(tr("Medienlink konnte nicht erstellt werden."));
 return r.data.signedUrl;
}
export async function mediaBlob(item:MediaItem):Promise<Blob>{
 if(item.local_blob)return item.local_blob;
 const r=await client().storage.from(item.bucket||'booking-media').download(item.path);
 if(r.error||!r.data)throw r.error||Error(tr("Download fehlgeschlagen."));
 return r.data;
}
export type HandoverSave={requestId:string;booking:Booking;action:'in'|'out';details:HandoverDetails;media:PendingMedia[];onProgress?:(completed:number,total:number)=>void};
export async function saveHandover(input:HandoverSave):Promise<Booking>{
 const {requestId,booking,action,details,media,onProgress}=input;
 if(!uuid.test(requestId)||!uuid.test(booking.id)||!['in','out'].includes(action))throw Error(tr("Ungültige Übergabe."));
 validateHandover(details,media);
 const d=client(),bucket=d.storage.from('booking-media');
 // Recover a lost success response before uploading anything again.
 const receipt=await d.from('booking_handovers').select('id,booking_id,action,undone_at').eq('id',requestId).maybeSingle();
 if(receipt.error)throw receipt.error;
 if(receipt.data){
  if(receipt.data.undone_at)throw Error(tr("Diese Übergabe wurde rückgängig gemacht. Bitte eine neue Übergabe beginnen."));
  if(receipt.data.booking_id!==booking.id||receipt.data.action!==action)throw Error(tr("Diese Übergabe-ID wurde bereits verwendet."));
  const saved=await d.rpc('complete_booking_handover',{p_request_id:requestId,p_booking_id:booking.id,p_action:action,p_details:details,p_media:[],p_expected_in:booking.checked_in_at,p_expected_out:booking.checked_out_at,p_expected_revision:booking.lifecycle_revision??0});
  if(saved.error)throw saved.error;
  return normalizeBooking({...saved.data,lifecycle_revision:booking.lifecycle_revision??0} as Booking);
 }
 let completed=0;const metadata:MediaItem[]=[];onProgress?.(0,media.length);
 for(const item of media){
  const path=mediaPath(booking.id,requestId,item);
  try{
   const r=await bucket.upload(path,item.blob,{contentType:item.mime_type,upsert:false,cacheControl:'0'});
   if(r.error){
    // Retry immutable names after ambiguous network responses without upsert privileges.
    const name=path.slice(booking.id.length+1),existing=await bucket.list(booking.id,{search:name,limit:100});
    const match=existing.data?.find(x=>x.name===name&&Number(x.metadata?.size)===item.blob.size&&baseMime(x.metadata?.mimetype||'')===item.mime_type);
    if(existing.error||!match)throw r.error;
   }
   metadata.push({id:item.id,path,kind:item.kind,mime_type:item.mime_type,captured_at:item.captured_at,size_bytes:item.blob.size});completed++;onProgress?.(completed,media.length);
  }catch{throw Error(completed+tr(" von ")+media.length+tr(" Medien gespeichert. Übergabe noch nicht abgeschlossen. Bitte erneut speichern; vorhandene Aufnahmen werden nicht dupliziert."))}
 }
 const result=await d.rpc('complete_booking_handover',{p_request_id:requestId,p_booking_id:booking.id,p_action:action,p_details:details,p_media:metadata,p_expected_in:booking.checked_in_at,p_expected_out:booking.checked_out_at,p_expected_revision:booking.lifecycle_revision??0});
 if(result.error){if(['PT409','40001'].includes(result.error.code))throw Error(tr("Die Übergabe wurde inzwischen geändert oder rückgängig gemacht. Bitte schließen, die Buchung neu öffnen und die Übergabe erneut beginnen. Bereits hochgeladene Entwürfe gelten nicht als bestätigte Übergabe."));throw Error(tr("Medien gespeichert, Übergabe noch nicht bestätigt. Bitte erneut speichern. ")+result.error.message);}
 if(!result.data)throw Error(tr("Keine Speicherbestätigung erhalten. Bitte erneut speichern."));
 return normalizeBooking({...result.data,lifecycle_revision:booking.lifecycle_revision??0} as Booking);
}
