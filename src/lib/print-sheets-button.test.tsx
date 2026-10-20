// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {deliverPdf} from './print-sheets-button';
const file=new File(['%PDF'],'tvp-2026-10-20.pdf',{type:'application/pdf'});
it('uses the share sheet on touch devices and asks for a second tap when the gesture expired',async()=>{
 const share=vi.fn().mockResolvedValue(undefined);
 expect(await deliverPdf(file,{share,canShare:()=>true} as never,true)).toBe('done');expect(share).toHaveBeenCalledWith({files:[file],title:file.name});
 const denied=vi.fn().mockRejectedValue(Object.assign(new Error('x'),{name:'NotAllowedError'}));
 expect(await deliverPdf(file,{share:denied,canShare:()=>true} as never,true)).toBe('needs-tap');
});
it('downloads on desktop',async()=>{
 URL.createObjectURL=vi.fn(()=>'blob:x');URL.revokeObjectURL=vi.fn();const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 const share=vi.fn();expect(await deliverPdf(file,{share,canShare:()=>true} as never,false)).toBe('done');
 expect(share).not.toHaveBeenCalled();expect(click).toHaveBeenCalled();
});
