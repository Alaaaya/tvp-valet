// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('../api',async()=>({db:null}));
import {BookingDetailView} from './booking-detail-view';
import {DriverPickerSheet} from './driver-picker-sheet';
import {mainBookingEvents,defaultMainFilters} from './booking-filters';
import {blank,driverField,directionDriver,type Booking} from '../model';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>|null=null,host:HTMLDivElement;
afterEach(async()=>{if(root){const x=root;await act(async()=>x.unmount());host.remove();root=null}});
async function mount(el:React.ReactElement){host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root!.render(el))}
const CI='2026-10-24T14:09:00Z';
const base={...blank(),code:'RD-1',customer_name:'X',plate:'P1',total:0,paid:0,status:'confirmed' as const,checked_in_at:CI};
const props=(x:any={})=>({booking:base,known:true,flightIn:<i/>,flightOut:<i/>,onBack:()=>{},onEdit:()=>{},onStartCheck:()=>{},onAction:()=>{},calledSlot:<b className="cin"/>,calledOutSlot:<b className="cout"/>,...x});

describe('red Retour driver button',()=>{
 it('is under the call (and "Als abgeholt markieren") in the red panel and opens the Retour picker',async()=>{
  const assignIn=vi.fn(),assignOut=vi.fn(),edit=vi.fn();
  await mount(<BookingDetailView {...props({onEdit:edit,onAssignDriver:assignIn,onAssignReturnDriver:assignOut,returnCalledAt:CI})}/>);
  const out=host.querySelector('.flight-panel.out .fp-actions')!;const btn=out.querySelector<HTMLButtonElement>('.fp-driver.fp-driver-out')!;
  expect(btn).not.toBeNull();expect(btn.getAttribute('aria-haspopup')).toBe('dialog');expect(btn.textContent).toBe('Keinem Fahrer zugewiesen');
  const kids=[...out.children];expect(kids.indexOf(btn)).toBe(kids.length-1);expect(kids.indexOf(out.querySelector('.cout')!)).toBeLessThan(kids.indexOf(btn));
  expect(out.textContent).toContain('Als abgeholt markieren');
  await act(async()=>btn.click());expect(assignOut).toHaveBeenCalledTimes(1);expect(assignIn).not.toHaveBeenCalled();expect(edit).not.toHaveBeenCalled();
 });
 it('also shown before the return call (only call button + driver)',()=>{
  const h=r(<BookingDetailView {...props({onAssignReturnDriver:()=>{}})}/>);
  const out=h.slice(h.indexOf('flight-panel out'));expect(out).toContain('fp-driver-out');expect(out).not.toContain('Als abgeholt markieren');
 });
 it('names are independent per side',()=>{
  const h=r(<BookingDetailView {...props({driverName:'Anna Arrival',returnDriverName:'Rami Retour',onAssignReturnDriver:()=>{}})}/>);
  const inSide=h.slice(h.indexOf('flight-panel in'),h.indexOf('flight-panel out')),outSide=h.slice(h.indexOf('flight-panel out'));
  expect(inSide).toContain('Anna Arrival');expect(inSide).not.toContain('Rami Retour');
  expect(outSide).toContain('Rami Retour');expect(outSide).not.toContain('Anna Arrival');
  const h2=r(<BookingDetailView {...props({driverName:'Anna Arrival',onAssignReturnDriver:()=>{}})}/>);
  expect(h2.slice(h2.indexOf('flight-panel out'))).toContain('Keinem Fahrer zugewiesen');
 });
 it('red styling fits the red panel',()=>{
  const css=readFileSync('src/driver-picker.css','utf8');
  expect(css).toMatch(/\.flight-panel\.out \.fp-actions \.fp-driver\.fp-driver-out[^{]*\{[^}]*background:#fff;color:#8f2f2a;box-shadow:inset 0 0 0 1px #f0bfbb/);
 });
});
describe('Retour picker',()=>{
 it('custom title and check on the Retour driver',async()=>{
  await mount(<DriverPickerSheet title="Retour-Fahrer zuweisen" assignedId="f1" meId="me" staff={[{id:'me',full_name:'Me',role:'admin'},{id:'f1',full_name:'Fahrer 1',role:'driver'}]} onPick={async()=>{}} onClose={()=>{}}/>);
  expect(host.querySelector('#dps-t')!.textContent).toBe('Retour-Fahrer zuweisen');expect(host.querySelector('.dps-row.on')!.textContent).toBe('Fahrer 1');
 });
});
describe('model + wiring',()=>{
 it('direction fields: Retour never falls back to the arrival driver',()=>{
  expect(driverField('in')).toBe('driver_id');expect(driverField('out')).toBe('return_driver_id');
  expect(directionDriver({driver_id:'a'},'out')).toBeNull();expect(directionDriver({driver_id:'a',return_driver_id:'b'},'out')).toBe('b');expect(directionDriver({driver_id:'a',return_driver_id:'b'},'in')).toBe('a');
 });
 it('main opens the picker per side and writes only that side',()=>{
  const m=readFileSync('src/main.tsx','utf8');
  expect(m).toContain("onAssignReturnDriver={()=>setDriverPick('out')}");
  expect(m).toContain('assignedId={directionDriver(selected,driverPick)}');
  expect(m).toContain('f=driverField(side),nb={...selected,[f]:id}');
  expect(m).toContain('offlineAssignDriver(selected,id,side)');
  const api=readFileSync('src/api.ts','utf8');expect(api).toContain("p_patch:{[driverField(side)]:driverId}");
 });
 it('return driver is never part of the admin full upsert payload',()=>{
  expect(readFileSync('src/lib/booking-payload.ts','utf8')).not.toContain('return_driver_id');
 });
 it('SQL migration adds the column and allows it in update_booking_ops',()=>{
  const sql=readFileSync('supabase/migrations/20261024160000_booking_return_driver.sql','utf8');
  expect(sql).toContain('add column if not exists return_driver_id uuid references public.profiles(id)');
  expect(sql).toContain("'driver_id','return_driver_id'");expect(sql).toContain("notify pgrst, 'reload schema'");
  expect(sql).not.toContain('czrypjsgjjmjzyyjhyxd');
 });
});
describe('booking list "Nur meine" per direction',()=>{
 const date='2026-10-24';
 const mk=(x:Partial<Booking>)=>({...blank(),id:crypto.randomUUID(),status:'confirmed' as const,arrival_at:'2026-10-24T08:00:00Z',departure_at:'2026-10-24T16:00:00Z',...x});
 const f={...defaultMainFilters(),assigned:true,flights:false};
 it('arrival row follows driver_id, Retour row follows return_driver_id',()=>{
  const ev=(b:Booking)=>mainBookingEvents([b],date,f,'me').map(e=>e.kind);
  expect(ev(mk({driver_id:'me'}))).toEqual(['in']);
  expect(ev(mk({driver_id:'x',return_driver_id:'me'}))).toEqual(['out']);
  expect(ev(mk({driver_id:'me',return_driver_id:'me'}))).toEqual(['in','out']);
  expect(ev(mk({driver_id:'x',return_driver_id:'y'}))).toEqual([]);
 });
});
