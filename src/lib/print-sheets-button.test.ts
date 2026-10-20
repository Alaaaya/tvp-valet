// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {deliverPdf} from './print-sheets-button';
const file=new File(['test'],'booking.pdf',{type:'application/pdf'});
it('uses native share for touch, with the generated PDF file',async()=>{
 const share=vi.fn().mockResolvedValue(undefined),canShare=vi.fn().mockReturnValue(true);
 expect(await deliverPdf(file,{share,canShare} as unknown as Navigator,true)).toBe('done');
 expect(share).toHaveBeenCalledWith({files:[file],title:'booking.pdf'});
});
it('native share cancellation does not trigger an unwanted download',async()=>{
 const share=vi.fn().mockRejectedValue({name:'AbortError'});
 expect(await deliverPdf(file,{share,canShare:()=>true} as unknown as Navigator,true)).toBe('done');
});
it('iOS lost activation requests a fresh user tap without attempting a blocked popup',async()=>{
 const share=vi.fn().mockRejectedValue({name:'NotAllowedError'});
 expect(await deliverPdf(file,{share,canShare:()=>true} as unknown as Navigator,true)).toBe('needs-tap');
 share.mockResolvedValueOnce(undefined);
 expect(await deliverPdf(file,{share,canShare:()=>true} as unknown as Navigator,true)).toBe('done');
});
it('desktop offers a PDF download and revokes the temporary URL later',async()=>{
 vi.useFakeTimers();
 const click=vi.fn(),remove=vi.fn(),a={click,remove,href:'',download:'',rel:''},appendChild=vi.fn();
 const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:qa'),revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 vi.stubGlobal('document',{createElement:()=>a,body:{appendChild}});
 try{
 expect(await deliverPdf(file,{} as Navigator,false)).toBe('done');
 expect(a.download).toBe('booking.pdf');expect(click).toHaveBeenCalledOnce();expect(appendChild).toHaveBeenCalledWith(a);
 expect(revoke).not.toHaveBeenCalled();vi.advanceTimersByTime(60000);expect(revoke).toHaveBeenCalledWith('blob:qa');
 }finally{vi.useRealTimers();vi.unstubAllGlobals();create.mockRestore();revoke.mockRestore()}
});
