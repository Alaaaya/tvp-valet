// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {demoSeed,type Booking} from '../model';
const mocks=vi.hoisted(()=>({pdf:vi.fn(),short:vi.fn(),deliver:vi.fn()}));
vi.mock('./print-short',()=>({shortPdfFile:mocks.short}));
vi.mock('./print-sheets',()=>({sheetsPdfFile:mocks.pdf}));
vi.mock('./print-sheets-button',()=>({deliverPdf:mocks.deliver}));
vi.mock('./use-edge-back',()=>({useEdgeBackBlock:()=>{}}));
import {BookingPrintDialog} from './booking-print-dialog';
let root:Root,host:HTMLElement;
const b=(o:Partial<Booking>={}):Booking=>({...demoSeed()[0],id:'x',arrival_at:'2020-01-02T09:00Z',...o});
const go=()=>document.querySelector<HTMLButtonElement>('.day-print-actions .primary')!;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});for(const m of [mocks.pdf,mocks.short])m.mockReset().mockResolvedValue(new File(['P'],'a.pdf'));mocks.deliver.mockReset().mockResolvedValue('done');host=document.createElement('div');document.body.append(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove()});
it('has only format controls and prints just this booking (Normal)',async()=>{
 const close=vi.fn(),bk=b();await act(async()=>root.render(<BookingPrintDialog booking={bk} onClose={close}/>));
 expect(document.querySelector('input[type=date]')).toBeNull();expect(document.querySelector('.day-print-count')).toBeNull();
 expect(document.querySelectorAll('input[type=radio]').length).toBe(2);
 await act(async()=>go().click());expect(mocks.pdf.mock.calls[0][0]).toEqual([{b:bk}]);expect(mocks.short).not.toHaveBeenCalled();expect(close).toHaveBeenCalledOnce();
});
it('Kurz uses the shared short generator',async()=>{
 await act(async()=>root.render(<BookingPrintDialog booking={b()} onClose={()=>{}}/>));
 await act(async()=>document.querySelector<HTMLInputElement>('input[value=short]')!.click());
 await act(async()=>go().click());expect(mocks.short.mock.calls[0][0]).toHaveLength(1);expect(mocks.pdf).not.toHaveBeenCalled();
});
it('cancel, backdrop and Escape close without printing',async()=>{
 const close=vi.fn();await act(async()=>root.render(<BookingPrintDialog booking={b()} onClose={close}/>));
 await act(async()=>document.querySelector<HTMLButtonElement>('.day-print-actions button')!.click());
 await act(async()=>document.querySelector<HTMLElement>('.day-print-backdrop')!.click());
 await act(async()=>{document.querySelector('section')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))});
 expect(close).toHaveBeenCalledTimes(3);expect(mocks.pdf).not.toHaveBeenCalled();expect(mocks.deliver).not.toHaveBeenCalled();
});
it('drops stale result after booking change',async()=>{
 let res!:(f:File)=>void;mocks.pdf.mockReturnValue(new Promise<File>(r=>res=r));
 await act(async()=>root.render(<BookingPrintDialog booking={b()} onClose={()=>{}}/>));await act(async()=>go().click());
 await act(async()=>root.render(<BookingPrintDialog booking={b({id:'y'})} onClose={()=>{}}/>));
 await act(async()=>res(new File(['P'],'s.pdf')));expect(mocks.deliver).not.toHaveBeenCalled();
});
it('Escape/backdrop while busy closes and the pending PDF is never delivered',async()=>{
 let res!:(f:File)=>void;mocks.pdf.mockReturnValue(new Promise<File>(r=>res=r));const close=vi.fn();
 await act(async()=>root.render(<BookingPrintDialog booking={b()} onClose={close}/>));await act(async()=>go().click());
 await act(async()=>{document.querySelector('section')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))});
 expect(close).toHaveBeenCalledOnce();await act(async()=>res(new File(['P'],'s.pdf')));expect(mocks.deliver).not.toHaveBeenCalled();
});
it('error allows retry without changing format',async()=>{
 mocks.pdf.mockRejectedValueOnce(new Error('boom'));
 await act(async()=>root.render(<BookingPrintDialog booking={b()} onClose={()=>{}}/>));await act(async()=>go().click());
 expect(document.querySelector('[role=alert]')).not.toBeNull();expect(go().disabled).toBe(false);
 await act(async()=>go().click());expect(mocks.deliver).toHaveBeenCalledOnce();
});
