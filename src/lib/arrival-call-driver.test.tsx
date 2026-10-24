// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('../api',()=>({db:null}));
import {arrivalCallTap,callFor} from './call-phase';
import {BookingDetailView,ArrivalCallDone,ReturnCallDone} from './booking-detail-view';
import {DriverPickerSheet,pickerRows,sortByFirstName} from './driver-picker-sheet';
import {setLanguage} from './i18n';
import {blank,type Employee} from '../model';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>|null=null,host:HTMLDivElement;
afterEach(async()=>{if(root){const x=root;await act(async()=>x.unmount());host.remove();root=null}setLanguage('de')});
async function mount(el:React.ReactElement){host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root!.render(el))}

const CI='2026-10-24T14:09:00Z',BEFORE='2026-10-24T13:00:00Z',AFTER='2026-10-24T15:00:00Z';
describe('green Anreise "Hat angerufen"',()=>{
 it('before check-in records / manages the arrival call',()=>{
  expect(arrivalCallTap(null,null)).toBe('record');
  expect(arrivalCallTap(BEFORE,null)).toBe('manage');
 });
 it('after check-in: an earlier arrival call stays the arrival call and is never re-stamped as return',()=>{
  expect(arrivalCallTap(BEFORE,CI)).toBe('recorded');
  expect(callFor('in',BEFORE,CI)).toBe(BEFORE);expect(callFor('out',BEFORE,CI)).toBeNull();
 });
 it('after check-in without arrival call: not written into the single column (would become the return call)',()=>{
  expect(arrivalCallTap(null,CI)).toBe('needs-column');
  expect(arrivalCallTap(AFTER,CI)).toBe('needs-column');
 });
 it('main: green button is no longer disabled by check-in and never repeats after check-in',()=>{
  const m=readFileSync('src/main.tsx','utf8');const i=m.indexOf("if(ph==='in'){"),seg=m.slice(i,m.indexOf("if(own&&ph==='out')",i));
  expect(i).toBeGreaterThan(0);
  expect(seg).toContain('arrivalCallTap(cAt,selected.checked_in_at)');
  expect(seg).not.toContain('!!selected.checked_in_at');
  expect(seg).toContain("tap==='needs-column'");
  expect(seg).not.toContain('callCustomer(selected,true)');
  expect(seg).toContain('<ArrivalCallDone');expect(seg).toContain('actors.call_in');
 });
 it('arrival done shows time + "von Name" in green, return done stays pink',()=>{
  const g=r(<ArrivalCallDone time="15:52" by="Alaa" onClick={()=>{}}/>),p=r(<ReturnCallDone time="16:30" by="Sam" onClick={()=>{}}/>);
  expect(g).toContain('op-btn in fp-call-done');expect(g).toContain('<time>15:52</time>');expect(g).toContain('Alaa');
  expect(p).toContain('op-btn out fp-call-done');expect(p).toContain('<time>16:30</time>');
  const css=readFileSync('src/reference-match-detail-style.css','utf8');
  expect(css).toMatch(/\.flight-panel\.in \.fp-actions \.op-btn\.fp-call-done\{[^}]*background:#d0f4d8/);
  expect(css).toMatch(/\.flight-panel\.in \.fp-actions \.op-btn\.fp-call-done \.fp-call-done-by\{[^}]*opacity:1/);
  expect(css).toMatch(/\.flight-panel\.out \.fp-actions \.op-btn\.fp-call-done\{[^}]*background:#f7d8d6/);
 });
});

const base={...blank(),code:'AF-1',customer_name:'X',plate:'P1',total:0,paid:0,status:'confirmed' as const,checked_in_at:CI};
const props=(x:any={})=>({booking:base,known:true,flightIn:<i/>,flightOut:<i/>,onBack:()=>{},onEdit:()=>{},onStartCheck:()=>{},onAction:()=>{},calledSlot:<b className="cin"/>,calledOutSlot:<b className="cout"/>,...x});
describe('driver button',()=>{
 it('opens the driver picker, not the edit menu',async()=>{
  const edit=vi.fn(),assign=vi.fn();await mount(<BookingDetailView {...props({onEdit:edit,onAssignDriver:assign})}/>);
  const btn=host.querySelector<HTMLButtonElement>('.flight-panel.in .fp-driver')!;expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
  await act(async()=>btn.click());expect(assign).toHaveBeenCalledTimes(1);expect(edit).not.toHaveBeenCalled();
 });
 it('shows the assigned driver name',()=>{expect(r(<BookingDetailView {...props({driverName:'Fahrer 1 Fahrer 1'})}/>)).toContain('Fahrer 1 Fahrer 1')});
 it('main wires picker to fresh profiles, the ops RPC and the button',()=>{
  const m=readFileSync('src/main.tsx','utf8');
  expect(m).toContain('onAssignDriver={()=>setDriverPick(true)}');
  expect(m).toContain('load={demo?undefined:loadAssignableStaff}');
  expect(m).toContain('offlineAssignDriver(selected,id)');
  const api=readFileSync('src/api.ts','utf8');expect(api).toContain("db.rpc('update_booking_ops',{p_id:id,p_patch:{driver_id:driverId}})");
  const sheet=readFileSync('src/lib/driver-picker-sheet.tsx','utf8');expect(sheet).toContain("from('profiles').select('id,full_name,role,active')");
  expect(sheet).not.toMatch(/eq\('role'/);
 });
});

const staff:Employee[]=[{id:'me',full_name:'Alaa Admin',role:'admin'},{id:'m2',full_name:'Manager 2 Manager 2',role:'admin'},{id:'f2',full_name:'Fahrer 2 Fahrer 2',role:'driver'},{id:'f1',full_name:'Fahrer 1 Fahrer 1',role:'driver'},{id:'s',full_name:'Service ParkingPro',role:'admin'}];
describe('picker rows',()=>{
 it('du selbst first, everyone else A→Z by first name regardless of role, unassigned last',()=>{
  expect(pickerRows(staff,'me','').map(x=>x.label)).toEqual(['du selbst','Fahrer 1 Fahrer 1','Fahrer 2 Fahrer 2','Manager 2 Manager 2','Service ParkingPro','Nicht dem Fahrer zugeordnet']);
  expect(pickerRows(staff,'me','')[0].id).toBe('me');expect(pickerRows(staff,'me','').at(-1)!.id).toBeNull();
 });
 it('Z→A and search',()=>{
  expect(sortByFirstName(staff,'desc')[0].full_name).toBe('Service ParkingPro');
  expect(pickerRows(staff,'me','fahrer 2').map(x=>x.label)).toEqual(['Fahrer 2 Fahrer 2']);
  expect(pickerRows(staff,'me','alaa').map(x=>x.key)).toEqual(['me']);
 });
});
describe('DriverPickerSheet',()=>{
 it('reference layout with teal check on the assigned row',async()=>{
  await mount(<DriverPickerSheet assignedId={null} meId="me" staff={staff} onPick={async()=>{}} onClose={()=>{}}/>);
  expect(host.querySelector('#dps-t')!.textContent).toBe('Fahrer zuweisen');
  expect(host.querySelector('.dps-sort')!.textContent).toBe('A→Z Vorname');
  expect(host.querySelector<HTMLInputElement>('.dps-search input')!.placeholder).toBe('Suchen');
  const on=host.querySelectorAll('.dps-row.on');expect(on.length).toBe(1);expect(on[0].textContent).toBe('Nicht dem Fahrer zugeordnet');expect(on[0].querySelector('.dps-check')).not.toBeNull();
  await act(async()=>host.querySelector<HTMLButtonElement>('.dps-sort')!.click());
  expect(host.querySelector('.dps-sort')!.textContent).toBe('Z→A Vorname');
  expect([...host.querySelectorAll('.dps-row')].map(x=>x.textContent)[1]).toBe('Service ParkingPro');
 });
 it('selecting a row assigns and closes; unassign passes null',async()=>{
  const pick=vi.fn(async()=>{}),close=vi.fn();
  await mount(<DriverPickerSheet assignedId={null} meId="me" staff={staff} onPick={pick} onClose={close}/>);
  await act(async()=>host.querySelector<HTMLButtonElement>('.dps-row[data-key="f2"]')!.click());
  expect(pick).toHaveBeenCalledWith('f2');expect(close).toHaveBeenCalled();
  await act(async()=>root!.render(<DriverPickerSheet assignedId="f2" meId="me" staff={staff} onPick={pick} onClose={close}/>));
  await act(async()=>host.querySelector<HTMLButtonElement>('.dps-row[data-key="none"]')!.click());expect(pick).toHaveBeenLastCalledWith(null);
  await act(async()=>host.querySelector<HTMLButtonElement>('.dps-row[data-key="me"]')!.click());expect(pick).toHaveBeenLastCalledWith('me');
 });
 it('save error keeps the sheet open with the message',async()=>{
  const close=vi.fn();await mount(<DriverPickerSheet assignedId={null} meId="me" staff={staff} onPick={async()=>{throw new Error('nope')}} onClose={close}/>);
  await act(async()=>host.querySelector<HTMLButtonElement>('.dps-row[data-key="f1"]')!.click());
  expect(close).not.toHaveBeenCalled();expect(host.querySelector('.dps-err')!.textContent).toBe('nope');
 });
 it('data-driven: an account added later appears after the open-time load',async()=>{
  const fresh=[...staff,{id:'new',full_name:'Bea Neu',role:'driver' as const}],loaded=vi.fn();
  await mount(<DriverPickerSheet assignedId="new" meId="me" staff={staff} load={async()=>fresh} onLoaded={loaded} onPick={async()=>{}} onClose={()=>{}}/>);
  expect(loaded).toHaveBeenCalledWith(fresh);
  const rows=[...host.querySelectorAll('.dps-row')].map(x=>x.textContent);expect(rows[1]).toBe('Bea Neu');
  expect(host.querySelector('.dps-row.on')!.textContent).toBe('Bea Neu');
 });
 it('load failure keeps the known accounts and says so',async()=>{
  await mount(<DriverPickerSheet assignedId={null} meId="me" staff={staff} load={async()=>{throw new Error('offline')}} onPick={async()=>{}} onClose={()=>{}}/>);
  expect(host.querySelectorAll('.dps-row').length).toBe(6);expect(host.querySelector('.dps-note')!.textContent).toContain('offline');
 });
});
