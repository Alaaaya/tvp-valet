// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const rpc=vi.fn(async(..._a:any[]):Promise<any>=>({data:{ok:1},error:null}));
const BK='11111111-1111-4111-8111-111111111111',TA='2026-10-24T10:00:00.123456+00:00';
let tables:Record<string,any>={};
const chain=(name:string)=>{const q:any={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>tables[name]?.single??{data:null,error:null},then:(r:any,j:any)=>Promise.resolve(tables[name]?.list??{data:[],error:null}).then(r,j)};return q};
vi.mock('../api',()=>({db:{rpc:(...a:any[])=>rpc(...a),from:(n:string)=>chain(n)}}));
import {tsKey,sameInstant,preparePickupUndo,clearPickupMark,isPickupMarked} from './pickup-undo';
import {PickupUndoDialog,useHold,HOLD_MS} from './pickup-undo-view';
import {BookingDetailView} from './booking-detail-view';
import {setLanguage,t as tr} from './i18n';
import {blank} from '../model';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const booking:any={...blank(),id:BK,code:'P1',customer_name:'X',plate:'P',status:'confirmed',checked_in_at:'2026-10-20T08:00:00+00:00',checked_out_at:null,total:0,paid:0};
const ops:any={booking_id:BK,taken_away_at:TA,retrieved_at:null,customer_called_at:null,ride_started_at:null,performed_by:'u',updated_at:'x'};
const serverOk=()=>{tables={
 bookings:{single:{data:{id:BK,status:'confirmed',checked_in_at:'2026-10-20T08:00:00+00:00',checked_out_at:null,booking_handover_undos:[{count:2}]},error:null}},
 booking_operations:{single:{data:{booking_id:BK,taken_away_at:'2026-10-24T10:00:00.123456Z'},error:null}},
 booking_operation_events:{list:{data:[{id:77,booking_id:BK,action:'taken_away',occurred_at:TA,undone_at:null}],error:null}}}};
let root:ReturnType<typeof createRoot>|null=null,host:HTMLDivElement;
async function mount(el:React.ReactElement){host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root!.render(el))}
const setOnline=(v:boolean)=>Object.defineProperty(navigator,'onLine',{value:v,configurable:true});
beforeEach(()=>{serverOk();rpc.mockClear();rpc.mockImplementation(async()=>({data:{ok:1},error:null}));setOnline(true);vi.useRealTimers()});
afterEach(async()=>{if(root){const x=root;await act(async()=>x.unmount());host.remove();root=null}setLanguage('de');vi.useRealTimers()});
describe('timestamps',()=>{
 it('keeps microsecond precision and equates formats',()=>{
  expect(tsKey('2026-10-24T10:00:00.123456+00:00')).toBe(tsKey('2026-10-24 12:00:00.123456+02'));
  expect(sameInstant('2026-10-24T10:00:00.123456Z','2026-10-24T10:00:00.123457Z')).toBe(false);
  expect(sameInstant('2026-10-24T10:00:00Z','2026-10-24T10:00:00.000000+00:00')).toBe(true);
  expect(tsKey('nope')).toBeNull();expect(tsKey(null)).toBeNull();
 });
 it('eligibility only for confirmed checked-in marked bookings',()=>{
  expect(isPickupMarked(booking,ops)).toBe(true);
  expect(isPickupMarked(booking,{...ops,taken_away_at:null})).toBe(false);
  expect(isPickupMarked({...booking,checked_out_at:'2026-10-24T11:00:00Z'},ops)).toBe(true);
  expect(isPickupMarked({...booking,status:'cancelled'},ops)).toBe(false);
 });
});
describe('api',()=>{
 it('prepare builds exact snapshot from original event',async()=>{
  expect(await preparePickupUndo(booking,ops)).toEqual({bookingId:BK,eventId:'77',takenAwayAt:'2026-10-24T10:00:00.123456Z',revision:2,checkedInAt:'2026-10-20T08:00:00+00:00',checkedOutAt:null});
 });
 it('existing checkout is sent verbatim, but changing checkout is stale',async()=>{
  const out='2026-10-24T11:00:00.654321+00:00';
  const b={...booking,checked_out_at:out};
  tables.bookings.single.data.checked_out_at=out;
  const snap=await preparePickupUndo(b,ops);
  expect(snap.checkedOutAt).toBe(out);
  await clearPickupMark(snap);
  expect(rpc.mock.calls[0][1].p_expected_checked_out_at).toBe(out);
  tables.bookings.single.data.checked_out_at='2026-10-24T11:00:00.654322Z';
  await expect(preparePickupUndo(b,ops)).rejects.toMatchObject({stale:true});
 });
 it('bigint string remains exact, unsafe numeric ids fail closed',async()=>{
  tables.booking_operation_events.list.data[0].id='9223372036854775807';
  const snap=await preparePickupUndo(booking,ops);
  expect(snap.eventId).toBe('9223372036854775807');
  await clearPickupMark(snap);
  expect(rpc.mock.calls[0][1].p_event_id).toBe('9223372036854775807');
  for(const id of ['0','-1','1e3','9223372036854775808',Number.MAX_SAFE_INTEGER+1]){
   tables.booking_operation_events.list.data[0].id=id;
   await expect(preparePickupUndo(booking,ops)).rejects.toThrow();
  }
 });
 it('no matching event fails closed',async()=>{
  tables.booking_operation_events.list={data:[{id:5,booking_id:BK,action:'taken_away',occurred_at:'2026-10-24T10:00:00.123457+00:00',undone_at:null}],error:null};
  await expect(preparePickupUndo(booking,ops)).rejects.toMatchObject({stale:true});
  tables.booking_operation_events.list={data:[],error:null};await expect(preparePickupUndo(booking,ops)).rejects.toThrow();
 });
 it('ambiguous duplicate events fail closed',async()=>{
  const e={id:1,booking_id:BK,action:'taken_away',occurred_at:TA,undone_at:null};tables.booking_operation_events.list={data:[e,{...e,id:2}],error:null};
  await expect(preparePickupUndo(booking,ops)).rejects.toThrow();
 });
 it('server changed mark/check-out/ops fails closed',async()=>{
  tables.bookings.single={data:{...tables.bookings.single.data,checked_out_at:'2026-10-24T11:00:00Z'},error:null};await expect(preparePickupUndo(booking,ops)).rejects.toMatchObject({stale:true});
  serverOk();tables.booking_operations.single={data:{taken_away_at:null},error:null};await expect(preparePickupUndo(booking,ops)).rejects.toMatchObject({stale:true});
  serverOk();tables.booking_operations.single={data:{taken_away_at:'2026-10-24T10:05:00Z'},error:null};await expect(preparePickupUndo(booking,ops)).rejects.toMatchObject({stale:true});
 });
 it('RLS-hidden rows (null data) fail closed',async()=>{tables.bookings.single={data:null,error:null};await expect(preparePickupUndo(booking,ops)).rejects.toThrow();});
 it('offline fails before any network or rpc',async()=>{
  setOnline(false);await expect(preparePickupUndo(booking,ops)).rejects.toThrow(tr('Zum Rückgängigmachen ist eine Internetverbindung nötig.'));
  await expect(clearPickupMark({bookingId:BK,eventId:'1',takenAwayAt:TA,revision:0,checkedInAt:TA,checkedOutAt:null})).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
 });
 it('rpc gets exact params; PT409 is stale; retry reuses same snapshot',async()=>{
  const s=await preparePickupUndo(booking,ops);await clearPickupMark(s);
  expect(rpc).toHaveBeenCalledWith('clear_booking_taken_away',{p_booking_id:BK,p_event_id:'77',p_expected_taken_away_at:'2026-10-24T10:00:00.123456Z',p_expected_lifecycle_revision:2,p_expected_checked_in_at:'2026-10-20T08:00:00+00:00',p_expected_checked_out_at:null});
  rpc.mockResolvedValueOnce({data:null,error:{code:'PT409',message:'x'}});await expect(clearPickupMark(s)).rejects.toMatchObject({stale:true});
  rpc.mockResolvedValueOnce({data:null,error:{code:'XX',message:'boom'}});await expect(clearPickupMark(s)).rejects.toThrow('boom');
  rpc.mockResolvedValueOnce({data:null,error:null});await expect(clearPickupMark(s)).rejects.toThrow();
  await clearPickupMark(s);
  const calls=rpc.mock.calls.map(c=>JSON.stringify(c[1]));expect(new Set(calls).size).toBe(1);
 });
 it('huge bigint ids stay exact strings',async()=>{tables.booking_operation_events.list={data:[{id:'9007199254740993',booking_id:BK,action:'taken_away',occurred_at:TA,undone_at:null}],error:null};const s=await preparePickupUndo(booking,ops);expect(s.eventId).toBe('9007199254740993');await clearPickupMark(s);expect((rpc.mock.calls[0][1] as any).p_event_id).toBe('9007199254740993')});
 it('rejects invalid snapshot',async()=>{await expect(clearPickupMark({bookingId:'bad',eventId:'1',takenAwayAt:TA,revision:0,checkedInAt:TA,checkedOutAt:null})).rejects.toThrow();expect(rpc).not.toHaveBeenCalled()});
});
function Hold({onHold,enabled=true}:{onHold:()=>void;enabled?:boolean}){const h=useHold({onHold,enabled});return <div data-testid="h" {...h}><button>x</button></div>}
const ev=(el:Element,type:string,init:any={})=>act(async()=>{const e=new Event(type,{bubbles:true,cancelable:true}) as any;Object.assign(e,{pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:0,clientY:0},init);el.dispatchEvent(e)});
describe('long press gesture',()=>{
 it('fires after threshold; not before; not on release',async()=>{
  vi.useFakeTimers();const f=vi.fn();await mount(<Hold onHold={f}/>);const el=host.firstElementChild!;
  await ev(el,'pointerdown');act(()=>{vi.advanceTimersByTime(HOLD_MS-50)});expect(f).not.toHaveBeenCalled();
  await ev(el,'pointerup');act(()=>{vi.advanceTimersByTime(500)});expect(f).not.toHaveBeenCalled();
  await ev(el,'pointerdown');act(()=>{vi.advanceTimersByTime(HOLD_MS+10)});expect(f).toHaveBeenCalledTimes(1);
 });
 it('moving, pointercancel, leave and blur cancel (scroll)',async()=>{
  vi.useFakeTimers();const f=vi.fn();await mount(<Hold onHold={f}/>);const el=host.firstElementChild!;
  for(const cancel of [()=>ev(el,'pointermove',{clientY:30}),()=>ev(el,'pointercancel'),()=>ev(el,'pointerout',{relatedTarget:null}),()=>ev(el,'focusout'),()=>ev(window as any,'scroll')]){
   await ev(el,'pointerdown');await cancel();act(()=>{vi.advanceTimersByTime(HOLD_MS*2)});
  }
  expect(f).not.toHaveBeenCalled();
  await ev(el,'pointerdown');await ev(el,'pointermove',{clientX:3,clientY:3});act(()=>{vi.advanceTimersByTime(HOLD_MS+10)});expect(f).toHaveBeenCalledTimes(1);
 });
 it('disabled never fires; contextmenu opens once',async()=>{
  vi.useFakeTimers();const f=vi.fn();await mount(<Hold onHold={f} enabled={false}/>);const el=host.firstElementChild!;
  await ev(el,'pointerdown');act(()=>{vi.advanceTimersByTime(2000)});await ev(el,'contextmenu');expect(f).not.toHaveBeenCalled();
 });
 it('contextmenu + timer fire only once',async()=>{
  vi.useFakeTimers();const f=vi.fn();await mount(<Hold onHold={f}/>);const el=host.firstElementChild!;
  await ev(el,'pointerdown');act(()=>{vi.advanceTimersByTime(HOLD_MS+10)});await ev(el,'contextmenu');expect(f).toHaveBeenCalledTimes(1);
 });
});
const dprops=(x:any={})=>({booking,known:true,ops,flightIn:<i/>,flightOut:<i/>,onBack:()=>{},onEdit:()=>{},onStartCheck:()=>{},onAction:vi.fn(),calledSlot:<b/>,calledOutSlot:<b/>,...x});
describe('detail view',()=>{
 it('marked: short tap does nothing, visible accessible button opens, unmarked has none',async()=>{
  const onAction=vi.fn(),open=vi.fn();
  await mount(<BookingDetailView {...dprops({onAction,onPickupUndo:open})}/>);
  const hold=host.querySelector('.pickup-hold')!;expect(hold).toBeTruthy();
  await act(async()=>{(hold.querySelector('.op-btn') as HTMLElement).click()});expect(onAction).not.toHaveBeenCalled();expect(open).not.toHaveBeenCalled();
  const more=host.querySelector('.pickup-more') as HTMLButtonElement;expect(more.getAttribute('aria-label')).toBe(tr('Abholung rückgängig machen …'));
  await act(async()=>more.click());expect(open).toHaveBeenCalledTimes(1);
  expect(hold.getAttribute('style')||'').not.toMatch(/touch-action:\s*none/);
 });
 it('unmarked taken-away button is unchanged and has no undo',async()=>{
  await mount(<BookingDetailView {...dprops({ops:{...ops,taken_away_at:null},onPickupUndo:vi.fn()})}/>);
  expect(host.querySelector('.pickup-hold')).toBeNull();expect(host.querySelector('.pickup-more')).toBeNull();
 });
 it('undo is available for checked-out marks',async()=>{
  await mount(<BookingDetailView {...dprops({booking:{...booking,checked_out_at:'2026-10-24T11:00:00+00:00'},onPickupUndo:vi.fn()})}/>);
  expect(host.querySelector('.pickup-more')).not.toBeNull();
 });
 it('arabic label for RTL',async()=>{setLanguage('ar');await mount(<BookingDetailView {...dprops({onPickupUndo:vi.fn()})}/>);expect(host.querySelector('.pickup-more')!.getAttribute('aria-label')).toBe('التراجع عن الاستلام …')});
});
const q=(t:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent!.includes(t)) as HTMLButtonElement;
const flush=()=>act(async()=>{await new Promise(r=>setTimeout(r,0))});
describe('dialog',()=>{
 it('needs two explicit steps; cancel does nothing',async()=>{
  const onDone=vi.fn(),onClose=vi.fn();await mount(<PickupUndoDialog booking={booking} ops={ops} onClose={onClose} onDone={onDone}/>);
  expect(rpc).not.toHaveBeenCalled();
  await act(async()=>q('Abholung rückgängig machen').click());await flush();
  expect(host.textContent).toContain('wirklich');expect(rpc).not.toHaveBeenCalled();
  await act(async()=>q('Abbrechen').click());expect(onClose).toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();expect(onDone).not.toHaveBeenCalled();
 });
 it('confirm calls rpc once then onDone (no optimistic clear before)',async()=>{
  const onDone=vi.fn();let release:(v:any)=>void=()=>{};rpc.mockImplementationOnce(()=>new Promise(r=>{release=r}));
  await mount(<PickupUndoDialog booking={booking} ops={ops} onClose={()=>{}} onDone={onDone}/>);
  await act(async()=>q('Abholung rückgängig machen').click());await flush();
  await act(async()=>q('Ja, rückgängig').click());await act(async()=>q('Ja, rückgängig')?.click());
  expect(rpc).toHaveBeenCalledTimes(1);expect(onDone).not.toHaveBeenCalled();
  await act(async()=>release({data:{ok:1},error:null}));await flush();expect(onDone).toHaveBeenCalledWith(BK);
 });
 it('offline: error shown, no rpc',async()=>{
  setOnline(false);await mount(<PickupUndoDialog booking={booking} ops={ops} onClose={()=>{}} onDone={vi.fn()}/>);
  await act(async()=>q('Abholung rückgängig machen').click());await flush();
  expect(host.querySelector('[role=alert]')!.textContent).toContain('Internet');expect(rpc).not.toHaveBeenCalled();
 });
 it('stale conflict: message, only close, snapshot dropped',async()=>{
  const onDone=vi.fn();rpc.mockResolvedValueOnce({data:null,error:{code:'PT409',message:'x'}});
  await mount(<PickupUndoDialog booking={booking} ops={ops} onClose={()=>{}} onDone={onDone}/>);
  await act(async()=>q('Abholung rückgängig machen').click());await flush();await act(async()=>q('Ja, rückgängig').click());await flush();
  expect(host.textContent).toContain('inzwischen geändert');expect(q('Ja, rückgängig')).toBeUndefined();expect(q('Schließen')).toBeTruthy();expect(onDone).not.toHaveBeenCalled();
 });
 it('transient error retries with identical snapshot',async()=>{
  rpc.mockResolvedValueOnce({data:null,error:{code:'XX',message:'netz'}});const onDone=vi.fn();
  await mount(<PickupUndoDialog booking={booking} ops={ops} onClose={()=>{}} onDone={onDone}/>);
  await act(async()=>q('Abholung rückgängig machen').click());await flush();await act(async()=>q('Ja, rückgängig').click());await flush();
  expect(host.textContent).toContain('netz');await act(async()=>q('Erneut versuchen').click());await flush();
  expect(rpc).toHaveBeenCalledTimes(2);expect(JSON.stringify(rpc.mock.calls[0][1])).toBe(JSON.stringify(rpc.mock.calls[1][1]));expect(onDone).toHaveBeenCalled();
 });
 it('booking switch closes and never sends old snapshot',async()=>{
  const onClose=vi.fn();await mount(<PickupUndoDialog booking={booking} ops={ops} onClose={onClose} onDone={vi.fn()}/>);
  await act(async()=>root!.render(<PickupUndoDialog booking={{...booking,id:'22222222-2222-4222-8222-222222222222'}} ops={ops} onClose={onClose} onDone={vi.fn()}/>));
  expect(onClose).toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
 });
 it('escape closes; unmount mid-flight does not call onDone',async()=>{
  const onDone=vi.fn();let release:(v:any)=>void=()=>{};rpc.mockImplementationOnce(()=>new Promise(r=>{release=r}));
  await mount(<PickupUndoDialog booking={booking} ops={ops} onClose={()=>{}} onDone={onDone}/>);
  await act(async()=>q('Abholung rückgängig machen').click());await flush();await act(async()=>q('Ja, rückgängig').click());
  const x=root!;root=null;await act(async()=>x.unmount());host.remove();await act(async()=>release({data:{ok:1},error:null}));await flush();expect(onDone).not.toHaveBeenCalled();
 });
});
