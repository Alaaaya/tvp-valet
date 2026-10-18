import {describe,it,expect,vi} from 'vitest';
vi.mock('../api',()=>({db:null}));
import {photoUploadMetadata} from './photo-upload';
describe('legacy photo upload metadata',()=>{
 it.each([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp'],['IMAGE/WEBP; charset=binary','webp']])('maps %s consistently', (type,extension)=>{
  expect(photoUploadMetadata(new Blob(['x'],{type}))).toEqual({contentType:type.toLowerCase().split(';')[0],extension});
 });
 it.each(['image/svg+xml','image/gif','image/heic','text/html',''])('rejects unsupported %s',type=>{
  expect(()=>photoUploadMetadata(new Blob(['x'],{type}))).toThrow();
 });
 it('rejects empty images',()=>expect(()=>photoUploadMetadata(new Blob([],{type:'image/png'}))).toThrow());
 it('accepts exact limit and rejects one byte over',()=>{
  expect(photoUploadMetadata(new Blob([new Uint8Array(10*1024*1024)],{type:'image/png'})).extension).toBe('png');
  expect(()=>photoUploadMetadata(new Blob([new Uint8Array(10*1024*1024+1)],{type:'image/png'}))).toThrow();
 });
});
