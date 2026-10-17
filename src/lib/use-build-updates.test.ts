import {describe,it,expect} from 'vitest';
import {protectedUpdateUi} from './use-build-updates';
describe('protected update DOM safety',()=>{
 it('blocks child-owned forms dialogs camera signature upload and confirmation UI',()=>{
  let selector='';
  const doc={querySelector:(s:string)=>{selector=s;return {}},activeElement:null} as unknown as Document;
  expect(protectedUpdateUi(doc)).toBe(true);
  for(const s of ['form','role="dialog"','role="alertdialog"','video','canvas','input[type="file"]'])expect(selector).toContain(s);
 });
 it('blocks focused draft fields but releases safely idle DOM',()=>{
  const doc={querySelector:()=>null,activeElement:{matches:()=>true,closest:()=>null}} as unknown as Document;
  expect(protectedUpdateUi(doc)).toBe(true);
  expect(protectedUpdateUi({querySelector:()=>null,activeElement:null})).toBe(false);
 });
});
