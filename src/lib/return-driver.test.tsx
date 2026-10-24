// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
const rpc=vi.fn(async()=>({error:null})),sel=vi.fn(async()=>({data:[{id:'a',full_name:'Anna A',role:'admin',active:true},{id:'o',full_name:'Old Olaf',role:'driver',active:false},{id:'w',full_name:'Wael N',role:'driver',active:true}],error:null}));
vi.mock('../api',()=>({db:{rpc:(...a:any[])=>(rpc as any)(...a),from:()=>({select:()=>sel()})},assignBookingDriver:vi.fn(),assignBookingReturnDriver:async(id:string,d:string|null)=>{const{error}=await (rpc as any)('update_booking_ops',{p_id:id,p_patch:{return_driver_id:d}});if(error)throw error}}));
import {DriverPickerSheet,pickerRows,loadAssignableStaff} from './driver-picker-sheet';
import {BookingDetailView} from './booking-detail-view';
import {BookingListRow} from './booking-list-row';
import {setLanguage,t as tr} from './i18n';
import {blank} from '../model';
import {staffNames,clearStaffNames,staffNamesGeneration,rememberStaffNames} from './staff-names';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>|null=null,host:HTMLDivElement;
afterEach(async()=>{if(root){const x=root;await act(async()=>x.unmount());host.remove();root=null}setLanguage('de');rpc.mockClear()});
async function mount(el:React.ReactElement){host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root!.render(el))}
const b={...blank(),code:'R1',customer_name:'X',plate:'P1',total:0,paid:0};
const props=(x:any={})=>({booking:b,known:true,flightIn:<i/>,flightOut:<i/>,onBack:()=>{},onEdit:()=>{},onStartCheck:()=>{},onAction:()=>{},calledSlot:<b/>,calledOutSlot:<b/>,...x});
describe('return driver',()=>{
 it('clears names at session change and rejects stale async loads',()=>{
  rememberStaffNames([{id:'private',full_name:'Old account'}]);const old=staffNamesGeneration();clearStaffNames();
  rememberStaffNames([{id:'private',full_name:'Late old response'}],old);expect(staffNames.size).toBe(0);
 });
 it('return picker does not offer inactive self',()=>{
  expect(pickerRows([], 'inactive', '', 'asc', 'None', null, true).map(x=>x.key)).toEqual(['none']);
 });

 it('loads only active staff as choices but remembers inactive names',async()=>{
  const l=await loadAssignableStaff();expect(l.map(x=>x.id)).toEqual(['a','o','w'].filter(x=>x!=='o'));expect(staffNames.get('o')).toBe('Old Olaf');
  expect(pickerRows(l,undefined,'').some(x=>x.id==='o')).toBe(false);
 });
 it('inactive current assignment is shown checked but is not a normal choice',()=>{
  const l=[{id:'a',full_name:'Anna A',role:'admin' as const}];
  const rows=pickerRows(l,undefined,'','asc','Kein',`o`);expect(rows.map(x=>x.key)).toEqual(['stale','a','none']);expect(rows[0].label).toBe('Old Olaf (inaktiv)');
  expect(pickerRows(l,undefined,'','asc','Kein',null).map(x=>x.key)).toEqual(['a','none']);
  expect(pickerRows(l,undefined,'').map(x=>x.key)).toEqual(['a','none']);
 });
 it('detail: separate return button in red column, arrival button untouched',async()=>{
  const ra=vi.fn(),aa=vi.fn();await mount(<BookingDetailView {...props({returnDriverName:'Wael N',driverName:'Anna A',onAssignDriver:aa,onAssignReturnDriver:ra})}/>);
  const out=host.querySelector<HTMLButtonElement>('.flight-panel.out .fp-return-driver')!,inn=host.querySelector<HTMLButtonElement>('.flight-panel.in .fp-driver')!;
  expect(out.textContent).toBe('Wael N');expect(out.getAttribute('aria-haspopup')).toBe('dialog');expect(inn.textContent).toBe('Anna A');
  await act(async()=>out.click());expect(ra).toHaveBeenCalledTimes(1);expect(aa).not.toHaveBeenCalled();
 });
 it('detail: no return button without handler; empty label localized',async()=>{
  expect(r(<BookingDetailView {...props()}/>)).not.toContain('fp-return-driver');
  for(const[lg,txt] of [['en','Not assigned to return driver'],['de','Kein Rückgabe-Fahrer zugewiesen'],['ar','غير مُسند إلى سائق الإرجاع']] as const){setLanguage(lg);expect(r(<BookingDetailView {...props({onAssignReturnDriver:()=>{}})}/>)).toContain(txt)}
 });
 it('list row label only on Rückgabe rows',()=>{
  expect(r(<BookingListRow b={b} kind="out" time="10:00" completed={false} onOpen={()=>{}} returnDriverName="Wael N"/>)).toContain('Wael N');
  expect(r(<BookingListRow b={b} kind="in" time="10:00" completed={false} onOpen={()=>{}} returnDriverName="Wael N"/>)).not.toContain('Wael N');
  expect(r(<BookingListRow b={b} kind="out" time="10:00" completed={false} onOpen={()=>{}}/>)).not.toContain('blr-rd');
  for(const lg of ['en','de','ar'] as const){setLanguage(lg);expect(r(<BookingListRow b={b} kind="out" time="10:00" completed={false} onOpen={()=>{}} returnDriverName="Wael N"/>)).toContain(tr('Rückgabe-Fahrer'))}
  expect(readFileSync('src/booking-list-row.css','utf8')).toMatch(/\.blr-rd\{/);
 });
 it('picker: titles, accessibility, saves only chosen id, error stays open, RTL ar',async()=>{
  setLanguage('ar');const pick=vi.fn(async()=>{throw {message:'boom',code:'P0001'}});
  await mount(<DriverPickerSheet title={tr('Rückgabe-Fahrer zuweisen')} noneLabel={tr('Kein Rückgabe-Fahrer')} keepStale assignedId={'o'} staff={[{id:'a',full_name:'Anna A',role:'admin'}]} onPick={pick} onClose={()=>{}}/>);
  const dlg=host.querySelector('[role=dialog]')!;expect(dlg.getAttribute('aria-modal')).toBe('true');expect(host.querySelector('#dps-t')!.textContent).toBe('تعيين سائق الإرجاع');
  expect(host.querySelector('[role=option][aria-selected=true]')!.textContent).toContain('Old Olaf');
  expect(host.querySelector<HTMLButtonElement>('[data-key=stale]')!.disabled).toBe(true);
  const a=[...host.querySelectorAll<HTMLButtonElement>('[role=option]')].find(x=>x.textContent==='Anna A')!;await act(async()=>a.click());
  expect(pick).toHaveBeenCalledWith('a');expect(host.querySelector('[role=alert]')!.textContent).toBe('boom');
 });
 it('api/offline payload carries ONLY return_driver_id; arrival unchanged; wiring in main',async()=>{
  const {assignBookingReturnDriver}=await import('../api') as any;await assignBookingReturnDriver('b1','w');expect(rpc).toHaveBeenCalledWith('update_booking_ops',{p_id:'b1',p_patch:{return_driver_id:'w'}});
  const oa=readFileSync('src/lib/offline-actions.ts','utf8');expect(oa).toContain("await assignBookingReturnDriver(booking.id,driverId)");
  const m=readFileSync('src/main.tsx','utf8');expect(m).toContain('offlineAssignReturnDriver(selected,id)');expect(m).toContain("kind==='out'?nameOf(b.return_driver_id)");
  expect(readFileSync('src/lib/booking-payload.ts','utf8')).not.toContain('return_driver_id');
  expect(m).toContain('offlineAssignDriver(selected,id)');
 });
});
