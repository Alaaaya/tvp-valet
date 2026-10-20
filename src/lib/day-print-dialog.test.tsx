// @vitest-environment jsdom
import React,{act,StrictMode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {demoSeed,type Booking} from '../model';
const mocks=vi.hoisted(()=>({pdf:vi.fn(),deliver:vi.fn()}));
vi.mock('./print-sheets',()=>({sheetsPdfFile:mocks.pdf}));
vi.mock('./print-sheets-button',()=>({deliverPdf:mocks.deliver}));
vi.mock('./use-edge-back',()=>({useEdgeBackBlock:()=>{}}));
import {DayPrintDialog} from './day-print-dialog';
import {setLanguage} from './i18n';
let root:Root,host:HTMLElement;
const base=(o:Partial<Booking>={}):Booking=>({...demoSeed()[0],id:'in',arrival_at:'2026-10-20T09:00Z',departure_at:'2026-10-22T09:00Z',status:'confirmed',...o});
const rows=[base(),base({id:'out',arrival_at:'2026-10-18T09:00Z',departure_at:'2026-10-20T09:00Z'}),base({id:'same',departure_at:'2026-10-20T10:00Z'}),base({id:'cancel',status:'cancelled'})];
const button=()=>document.querySelector<HTMLButtonElement>('.day-print-actions .primary')!;
const date=()=>document.querySelector<HTMLInputElement>('input[type=date]')!;
const input=(el:HTMLInputElement,v:string)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))};
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-19T22:30Z'));setLanguage('de');mocks.pdf.mockReset();mocks.deliver.mockReset();mocks.pdf.mockResolvedValue(new File(['PDF'],'test.pdf'));mocks.deliver.mockResolvedValue('done');host=document.createElement('div');document.body.append(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.useRealTimers()});
it('defaults each opening to Berlin today, counts exact direction, controls zero and arbitrary dates',async()=>{
 await act(async()=>root.render(<DayPrintDialog rows={rows} onClose={()=>{}}/>));
 expect(date().value).toBe('2026-10-20');expect(document.querySelector('.day-print-count strong')!.textContent).toBe('2');
 await act(async()=>document.querySelector<HTMLInputElement>('input[value=out]')!.click());
 await act(async()=>button().click());expect(mocks.pdf.mock.calls[0][0].map((x:{b:Booking})=>x.b.id).sort()).toEqual(['out','same']);
 await act(async()=>input(date(),'2026-10-22'));expect(document.querySelector('.day-print-count strong')!.textContent).toBe('1');
 await act(async()=>input(date(),'2030-01-01'));expect(button().disabled).toBe(true);
 await act(async()=>root.render(<DayPrintDialog key="reopened" rows={rows} onClose={()=>{}}/>));expect(date().value).toBe('2026-10-20');
});
it('blocks loading and load errors, can cancel during loading',async()=>{
 const close=vi.fn();await act(async()=>root.render(<DayPrintDialog rows={rows} loading onClose={close}/>));
 expect(button().disabled).toBe(true);await act(async()=>document.querySelector<HTMLButtonElement>('.day-print-actions button')!.click());expect(close).toHaveBeenCalledOnce();
 await act(async()=>root.render(<DayPrintDialog rows={rows} loadError="failed" onClose={close}/>));expect(button().disabled).toBe(true);expect(document.querySelector('[role=alert]')!.textContent).toBe('failed');
});
it('prevents simultaneous clicks, drops a stale PDF after a rows update',async()=>{
 let resolve!:(f:File)=>void;mocks.pdf.mockReturnValue(new Promise<File>(r=>resolve=r));
 await act(async()=>root.render(<DayPrintDialog rows={rows} onClose={()=>{}}/>));
 await act(async()=>{button().click();button().click()});expect(mocks.pdf).toHaveBeenCalledOnce();expect(button().disabled).toBe(true);expect(date().disabled).toBe(true);
 await act(async()=>root.render(<DayPrintDialog rows={[...rows,base({id:'new'})]} onClose={()=>{}}/>));
 await act(async()=>resolve(new File(['PDF'],'stale.pdf')));expect(mocks.deliver).not.toHaveBeenCalled();expect(button().disabled).toBe(false);
});
it('does not deliver after account-switch unmount',async()=>{
 let resolve!:(f:File)=>void;mocks.pdf.mockReturnValue(new Promise<File>(r=>resolve=r));
 await act(async()=>root.render(<DayPrintDialog key="one" rows={rows} onClose={()=>{}}/>));await act(async()=>button().click());
 await act(async()=>root.render(<DayPrintDialog key="two" rows={[]} onClose={()=>{}}/>));
 await act(async()=>resolve(new File(['PDF'],'stale.pdf')));expect(mocks.deliver).not.toHaveBeenCalled();
});
it('errors disable printing until selection changes and translations are present',async()=>{
 mocks.pdf.mockRejectedValue(new Error('failed'));await act(async()=>root.render(<StrictMode><DayPrintDialog rows={rows} onClose={()=>{}}/></StrictMode>));
 await act(async()=>button().click());expect(button().disabled).toBe(true);expect(document.querySelector('[role=alert]')!.textContent).toContain('failed');
 await act(async()=>document.querySelector<HTMLInputElement>('input[value=out]')!.click());expect(button().disabled).toBe(false);
 for(const lang of ['en','ar'] as const){setLanguage(lang);await act(async()=>root.render(<DayPrintDialog key={lang} rows={rows} onClose={()=>{}}/>));expect(document.querySelector('h2')!.textContent).toBe(lang==='en'?'Print selection':'اختيار الطباعة')}
});
it('handles fresh-gesture retry without regenerating and does not reuse it after selection change',async()=>{
 mocks.deliver.mockResolvedValueOnce('needs-tap').mockResolvedValue('done');
 await act(async()=>root.render(<DayPrintDialog rows={rows} onClose={()=>{}}/>));await act(async()=>button().click());expect(button().textContent).toBe('PDF öffnen');
 await act(async()=>button().click());expect(mocks.pdf).toHaveBeenCalledOnce();expect(mocks.deliver).toHaveBeenCalledTimes(2);
 await act(async()=>document.querySelector<HTMLInputElement>('input[value=out]')!.click());await act(async()=>button().click());expect(mocks.pdf).toHaveBeenCalledTimes(2);
});
