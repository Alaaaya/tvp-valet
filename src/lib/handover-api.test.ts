import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({upload:vi.fn(),list:vi.fn(),rpc:vi.fn(),receipt:vi.fn(),booking:vi.fn(),metadata:vi.fn(),signed:vi.fn(),download:vi.fn()}));
vi.mock('../api',()=>({db:{
 storage:{from:()=>({upload:mock.upload,list:mock.list,createSignedUrl:mock.signed,download:mock.download})},
 rpc:mock.rpc,
 from:(table:string)=>({select:()=>({eq:()=>({
 maybeSingle:mock.receipt,single:mock.booking,order:mock.metadata
 })})})
}}));
import {blank} from '../model';
import {baseMime,createPendingMedia,validateMedia,validateHandover,mediaPath,saveHandover,listBookingMedia,signedMediaUrl,mediaBlob} from './handover-api';
const bid='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
const photo=()=>createPendingMedia(new Blob(['photo'],{type:'image/jpeg'}),'photo');
const details={km:123,key_cash:'10€ Wael',flight_number:'AA123',comment:'New comment',poor_visibility:false};
const booking={...blank(),id:bid};
beforeEach(()=>{vi.clearAllMocks();mock.receipt.mockResolvedValue({data:null,error:null});mock.upload.mockResolvedValue({data:{},error:null});mock.rpc.mockResolvedValue({data:{...booking,checked_in_at:'2026-10-17T14:00:00Z'},error:null});mock.list.mockResolvedValue({data:[],error:null});mock.metadata.mockResolvedValue({data:[],error:null})});
describe('media validation',()=>{
 it('normalizes Safari codecs',()=>expect(baseMime('video/mp4;codecs=avc1')).toBe('video/mp4'));
 it('accepts Safari MP4 and browser WebM',()=>{for(const type of ['video/mp4;codecs=avc1','video/webm','video/quicktime'])expect(validateMedia(new Blob(['ok'],{type}),'video')).toBe(baseMime(type))});
 it('rejects active image types',()=>{for(const type of ['image/svg+xml','text/html','application/javascript'])expect(()=>validateMedia(new Blob(['x'],{type}),'photo')).toThrow()});
 it('requires PNG signature',()=>expect(()=>validateMedia(new Blob(['x'],{type:'image/jpeg'}),'signature')).toThrow());
 it('rejects empty capture',()=>expect(()=>photo().blob&&validateMedia(new Blob([],{type:'image/jpeg'}),'photo')).toThrow());
 it('rejects unsupported HEIC truthfully',()=>expect(()=>createPendingMedia(new Blob(['heic'],{type:'image/heic'}),'photo')).toThrow());
 it('rejects future capture timestamp',()=>expect(()=>createPendingMedia(new Blob(['ok'],{type:'image/jpeg'}),'photo',undefined,'2999-01-01T00:00:00Z')).toThrow());
 it('builds single-filename booking/request path',()=>{const p=photo();expect(mediaPath(bid,requestId,p)).toBe(bid+'/'+requestId+'-'+p.id+'.jpg')});
 it('rejects ID path traversal',()=>expect(()=>mediaPath('../x',requestId,photo())).toThrow());
 it('preserves capture ISO and stable upload ID',()=>{const p=photo();expect(p.id).toMatch(/^[0-9a-f-]{36}$/);expect(Number.isFinite(Date.parse(p.captured_at))).toBe(true)});
 it.each([-1,1.3,2147483648])('rejects invalid mileage %s',km=>expect(()=>validateHandover({...details,km},[])).toThrow());
 it('accepts optional mileage/signature/media',()=>expect(()=>validateHandover({...details,km:null},[])).not.toThrow());
 it('rejects excess captures',()=>expect(()=>validateHandover(details,Array.from({length:41},photo))).toThrow());
 it('rejects duplicate media IDs',()=>{const p=photo();expect(()=>validateHandover(details,[p,p])).toThrow()});
 it('rejects more than one signature',()=>{const p=()=>createPendingMedia(new Blob(['x'],{type:'image/png'}),'signature');expect(()=>validateHandover(details,[p(),p()])).toThrow()});
});
describe('private atomic save and retries',()=>{
 it('uploads privately before final secure RPC and uses server timestamps',async()=>{
  const p=photo(),progress=vi.fn();const r=await saveHandover({requestId,booking,action:'in',details,media:[p],onProgress:progress});
  expect(mock.upload).toHaveBeenCalledWith(mediaPath(bid,requestId,p),p.blob,{contentType:'image/jpeg',upsert:false,cacheControl:'0'});
  expect(mock.rpc).toHaveBeenCalledWith('complete_booking_handover',expect.objectContaining({p_request_id:requestId,p_details:details,p_expected_in:booking.checked_in_at,p_expected_out:booking.checked_out_at,p_expected_revision:0,p_media:[expect.objectContaining({id:p.id,captured_at:p.captured_at,size_bytes:5})]}));
  expect(mock.upload.mock.invocationCallOrder[0]).toBeLessThan(mock.rpc.mock.invocationCallOrder[0]);
  expect(r.checked_in_at).toBe('2026-10-17T14:00:00Z');expect(progress).toHaveBeenLastCalledWith(1,1);
 });
 it('partial upload failure never completes booking',async()=>{
  mock.upload.mockResolvedValueOnce({error:null}).mockResolvedValueOnce({error:{message:'offline'}});
  await expect(saveHandover({requestId,booking,action:'out',details,media:[photo(),photo()]})).rejects.toThrow('1 von 2');
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('retry reuses immutable object after ambiguous storage response',async()=>{
  const p=photo(),path=mediaPath(bid,requestId,p);mock.upload.mockResolvedValue({error:{message:'Duplicate'}});
  mock.list.mockResolvedValue({data:[{name:path.split('/')[1],metadata:{size:p.blob.size,mimetype:p.mime_type}}],error:null});
  await expect(saveHandover({requestId,booking,action:'in',details,media:[p]})).resolves.toHaveProperty('id',bid);expect(mock.rpc).toHaveBeenCalledOnce();
 });
 it('does not accept a different existing size',async()=>{
  const p=photo();mock.upload.mockResolvedValue({error:{message:'Duplicate'}});mock.list.mockResolvedValue({data:[{name:mediaPath(bid,requestId,p).split('/')[1],metadata:{size:1,mimetype:p.mime_type}}]});
  await expect(saveHandover({requestId,booking,action:'in',details,media:[p]})).rejects.toThrow('noch nicht abgeschlossen');expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('RPC failure preserves truthful partial state',async()=>{mock.rpc.mockResolvedValue({error:{message:'Check failed'}});await expect(saveHandover({requestId,booking,action:'out',details,media:[photo()]})).rejects.toThrow('noch nicht bestätigt')});
 it('stale lifecycle is not presented as a save-retry success',async()=>{mock.rpc.mockResolvedValue({error:{code:'PT409',message:'changed'}});await expect(saveHandover({requestId,booking,action:'in',details,media:[]})).rejects.toThrow('neu öffnen')});
 it('lost successful response recovers receipt via locked RPC without reupload',async()=>{
  mock.receipt.mockResolvedValue({data:{id:requestId,booking_id:bid,action:'in'},error:null});mock.booking.mockResolvedValue({data:booking,error:null});
  await expect(saveHandover({requestId,booking,action:'in',details,media:[photo()]})).resolves.toHaveProperty('id',bid);expect(mock.upload).not.toHaveBeenCalled();expect(mock.rpc).toHaveBeenCalledOnce();
 });
 it('receipt recovery racing an undo trusts the locked server rejection',async()=>{mock.receipt.mockResolvedValue({data:{id:requestId,booking_id:bid,action:'in'}});mock.rpc.mockResolvedValue({error:Error('already undone')});await expect(saveHandover({requestId,booking,action:'in',details,media:[]})).rejects.toThrow('already undone');expect(mock.booking).not.toHaveBeenCalled()});
 it('binds draft revision even when both timestamps return to null',async()=>{await saveHandover({requestId,booking:{...booking,lifecycle_revision:7},action:'in',details,media:[]});expect(mock.rpc.mock.calls[0][1].p_expected_revision).toBe(7)});
 it('rejects stale receipt after undo instead of treating it as completion',async()=>{
  mock.receipt.mockResolvedValue({data:{id:requestId,booking_id:bid,action:'in',undone_at:'2026-10-17T15:00:00Z'}});
  await expect(saveHandover({requestId,booking,action:'in',details,media:[]})).rejects.toThrow('rückgängig');
  expect(mock.upload).not.toHaveBeenCalled();expect(mock.rpc).not.toHaveBeenCalled();
 });
 it('rejects receipt reused for other booking/action',async()=>{mock.receipt.mockResolvedValue({data:{booking_id:bid,action:'out'}});await expect(saveHandover({requestId,booking,action:'in',details,media:[]})).rejects.toThrow('bereits verwendet');expect(mock.rpc).not.toHaveBeenCalled()});
 it('does not silently treat receipt lookup failure as absence',async()=>{mock.receipt.mockResolvedValue({error:Error('Auth unavailable')});await expect(saveHandover({requestId,booking,action:'in',details,media:[]})).rejects.toThrow();expect(mock.upload).not.toHaveBeenCalled()});
});
describe('gallery private access',()=>{
 it('short lived URLs only',async()=>{const item={id:'id',path:bid+'/x.jpg',kind:'photo' as const,mime_type:'image/jpeg',captured_at:'',size_bytes:3};mock.signed.mockResolvedValue({data:{signedUrl:'signed'}});expect(await signedMediaUrl(item)).toBe('signed');expect(mock.signed).toHaveBeenCalledWith(item.path,300)});
 it('download authenticated blob not public URL',async()=>{const blob=new Blob(['x']);mock.download.mockResolvedValue({data:blob});expect(await mediaBlob({id:'id',path:bid+'/x.jpg',kind:'photo',mime_type:'image/jpeg',captured_at:'',size_bytes:1})).toBe(blob)});
 it('preserves legacy photos, hides abandoned draft objects',async()=>{const p=photo();mock.list.mockResolvedValue({data:[{id:'legacy',name:'old.jpg',created_at:'2026-01-01T00:00:00Z',metadata:{mimetype:'image/jpeg',size:5}},{id:p.id,name:mediaPath(bid,requestId,p).split('/')[1],metadata:{mimetype:'image/jpeg',size:5}}]});const r=await listBookingMedia(bid);expect(r).toHaveLength(1);expect(r[0].id).toBe('legacy')});
 it('keeps undone evidence and maps history marker without broadening storage access',async()=>{
  mock.metadata.mockResolvedValue({data:[{id:'id',path:bid+'/x.png',kind:'signature',mime_type:'image/png',captured_at:'2026-10-17T12:00:00Z',size_bytes:3,booking_handovers:{undone_at:'2026-10-17T13:00:00Z',undone_by:requestId}}]});
  expect(await listBookingMedia(bid)).toEqual([expect.objectContaining({id:'id',undone_at:'2026-10-17T13:00:00Z',undone_by:requestId})]);
 });
 it('handles array-shaped join and active handover',async()=>{
  mock.metadata.mockResolvedValue({data:[{id:'id',path:bid+'/x.png',kind:'signature',mime_type:'image/png',captured_at:'2026-10-17T12:00:00Z',size_bytes:3,booking_handovers:[{undone_at:null,undone_by:null}]}]});
  expect((await listBookingMedia(bid))[0].undone_at).toBeNull();
 });
 it('metadata errors do not silently show empty gallery',async()=>{mock.metadata.mockResolvedValue({error:Error('Forbidden')});await expect(listBookingMedia(bid)).rejects.toThrow('Forbidden')});
});
