// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {loginEmail,staffUsername,validateStaffDraft,staffError,STAFF_DOMAIN} from './staff-accounts';
import {StaffSettings,demoStaffApi,type StaffApi} from './staff-settings';
import {deriveAttribution} from './attribution';
import {BookingDetailView} from './booking-detail-view';
import {blank} from '../model';
import {setLanguage} from './i18n';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;

describe('username → email mapping',()=>{
  it('appends the staff domain to usernames, lowercased',()=>{
    expect(loginEmail('Wael')).toBe('wael@'+STAFF_DOMAIN);
    expect(loginEmail('  saleh.k ')).toBe('saleh.k@staff.tvp-valet.de');
  });
  it('keeps real e-mail logins unchanged',()=>{expect(loginEmail('Owner@Example.com')).toBe('Owner@Example.com');expect(loginEmail(' a@b.de ')).toBe('a@b.de')});
  it('shows the username for staff-domain accounts and the e-mail otherwise',()=>{
    expect(staffUsername('wael@staff.tvp-valet.de')).toBe('wael');
    expect(staffUsername('owner@gmail.com')).toBe('owner@gmail.com');
    expect(staffUsername(null)).toBe('');
  });
});

describe('staff form validation',()=>{
  const ok={full_name:'Wael',username:'wael',password:'secret123',role:'driver' as const};
  it('accepts a valid draft',()=>expect(validateStaffDraft(ok)).toEqual({}));
  it('rejects bad username, short password and empty name',()=>{
    const e=validateStaffDraft({full_name:'  ',username:'w a',password:'short',role:'driver'});
    expect(Object.keys(e).sort()).toEqual(['full_name','password','username']);
    expect(validateStaffDraft({...ok,username:'ab'}).username).toBeTruthy();
    expect(validateStaffDraft({...ok,username:'x'.repeat(33)}).username).toBeTruthy();
    expect(validateStaffDraft({...ok,full_name:'x'.repeat(121)}).full_name).toBeTruthy();
  });
  it('rejects a username that already exists',()=>expect(validateStaffDraft(ok,[{email:'WAEL@staff.tvp-valet.de'}]).username).toMatch(/vergeben/));
  it('maps backend errors to clear text',()=>{
    expect(staffError(Error('Username already exists'))).toMatch(/vergeben/);
    expect(staffError({message:'Cannot disable or demote the last active admin'})).toMatch(/letzte aktive Admin/);
    expect(staffError({message:'Could not find the function public.admin_create_staff'})).toMatch(/SQL/);
  });
  it('migration is admin-only, hashes with bcrypt and fills GoTrue token columns',()=>{
    const sql=readFileSync('supabase/migrations/20261020120000_staff_accounts.sql','utf8');
    expect(sql.match(/private\.is_admin\(\)/g)?.length).toBe(2);
    expect(sql).toContain("extensions.gen_salt('bf')");
    expect(sql).toMatch(/confirmation_token, recovery_token, email_change_token_new, email_change\)/);
    expect(sql).toContain('provider_id');
    expect(sql).not.toMatch(/identities\([^)]*\bemail\b/);
    expect(sql).toContain("notify pgrst, 'reload schema'");
  });
});

let root:ReturnType<typeof createRoot>|null=null,host:HTMLDivElement;
afterEach(async()=>{if(root){const x=root;await act(async()=>x.unmount());host.remove();root=null}setLanguage('de')});
function type(el:HTMLInputElement|HTMLSelectElement,v:string){const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,v);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}))}
async function mount(api:StaffApi){host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root!.render(<StaffSettings api={api} meId="a1"/>));await act(async()=>{})}

describe('staff settings',()=>{
  const seed=[{id:'a1',full_name:'Alaa',email:'alaa@gmail.com',role:'admin' as const,active:true},{id:'d1',full_name:'Wael',email:'wael@staff.tvp-valet.de',role:'driver' as const,active:false}];
  it('lists name, username, role and active state',async()=>{
    await mount(demoStaffApi(seed));const t=host.textContent||'';
    expect(t).toContain('Alaa');expect(t).toContain('alaa@gmail.com');expect(t).toContain('wael');expect(t).not.toContain('wael@staff');expect(t).toContain('Inaktiv');
  });
  it('validates before calling the backend, then creates and refreshes',async()=>{
    const api=demoStaffApi(seed),create=vi.spyOn(api,'create');await mount(api);
    const form=host.querySelector('form.staff-add') as HTMLFormElement,inputs=form.querySelectorAll('input');
    await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(create).not.toHaveBeenCalled();expect(form.querySelectorAll('.staff-field-err').length).toBe(3);
    await act(async()=>{type(inputs[0],'Saleh');type(inputs[1],'Saleh');type(inputs[2],'geheim123')});
    await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(create).toHaveBeenCalledWith({full_name:'Saleh',username:'saleh',password:'geheim123',role:'driver'});
    expect(host.querySelectorAll('.staff-list>li').length).toBe(3);expect(host.textContent).toContain('Mitarbeiter angelegt.');
  });
  it('shows backend errors and blocks deactivating yourself',async()=>{
    const api=demoStaffApi(seed);api.update=async()=>{throw {message:'Cannot disable or demote the last active admin'}};await mount(api);
    const own=host.querySelectorAll('.staff-list>li')[0],buttons=own.querySelectorAll('button');
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(true);
    await act(async()=>type(own.querySelector('select')!,'driver'));
    expect(host.querySelector('.staff-err')?.textContent).toMatch(/letzte aktive Admin/);
  });
  it('sets a new password with length check',async()=>{
    const api=demoStaffApi(seed),setPw=vi.spyOn(api,'setPassword');await mount(api);
    const row=host.querySelectorAll('.staff-list>li')[1];await act(async()=>(row.querySelectorAll('button')[0] as HTMLButtonElement).click());
    const input=row.querySelector('.staff-pw input') as HTMLInputElement,save=row.querySelector('.staff-pw button') as HTMLButtonElement;
    await act(async()=>{type(input,'123');});await act(async()=>save.click());expect(setPw).not.toHaveBeenCalled();
    await act(async()=>{type(input,'neuesPass1');});await act(async()=>save.click());expect(setPw).toHaveBeenCalledWith('d1','neuesPass1');
  });
});

describe('attribution',()=>{
  const ci='2026-10-20T08:00:00Z',co='2026-10-22T10:00:00Z';
  const names={u1:'Wael',u2:'Saleh',u3:'Alaa'};
  it('maps stored actor ids to names only for completed steps',()=>{
    const a=deriveAttribution({booking:{checked_in_at:ci,checked_out_at:null},ops:{taken_away_at:'2026-10-21T09:00:00Z',retrieved_at:null,customer_called_at:'2026-10-21T08:00:00Z'},
      handovers:[{action:'in',performed_by:'u1',completed_at:ci},{action:'out',performed_by:'u2',completed_at:co}],
      events:[{action:'taken_away',actor_id:'u2',occurred_at:'2026-10-21T09:00:00Z'},{action:'retrieved',actor_id:'u3',occurred_at:'2026-10-21T10:00:00Z'}],
      calls:[{occurred_at:'2026-10-19T08:00:00Z',actor_id:'u1',actor_name:'Wael'},{occurred_at:'2026-10-21T08:00:00Z',actor_id:'u3',actor_name:'Alaa'}],names});
    expect(a).toEqual({in:'Wael',taken_away:'Saleh',call_out:'Alaa'});
  });
  it('puts a call before check-in into the arrival column',()=>{
    const a=deriveAttribution({booking:{checked_in_at:null,checked_out_at:null},ops:{taken_away_at:null,retrieved_at:null,customer_called_at:'2026-10-19T08:00:00Z'},calls:[{occurred_at:'2026-10-19T08:00:00Z',actor_id:'u1',actor_name:'Wael'}],names});
    expect(a).toEqual({call_in:'Wael'});
  });
  it('renders "von <Name>" as a small line in done buttons',()=>{
    const b={...blank(),code:'X',customer_name:'K',plate:'D-X 1',arrival_at:ci,departure_at:co,checked_in_at:ci};
    const h=r(<BookingDetailView booking={b} known ops={{booking_id:b.id,taken_away_at:'2026-10-21T09:00:00Z',retrieved_at:'2026-10-21T10:00:00Z',customer_called_at:null,ride_started_at:null,performed_by:'u2',updated_at:co}}
      actors={{in:'Wael',taken_away:'Saleh',retrieved:'Alaa'}} flightIn={null} flightOut={null} onBack={()=>{}} onEdit={()=>{}} onStartCheck={()=>{}} onAction={()=>{}}/>);
    expect(h.match(/class="op-by( inline)?"/g)?.length).toBe(3);
    expect(h).toMatch(/class="op-by">[^<]*<bdi>Wael<\/bdi>/);expect(h).toMatch(/class="op-at">[^<]*<span class="op-by inline">/);expect(h).toContain('<bdi>Saleh</bdi>');expect(h).toContain('has-by');
    const none=r(<BookingDetailView booking={{...b,checked_in_at:null}} known flightIn={null} flightOut={null} onBack={()=>{}} onEdit={()=>{}} onStartCheck={()=>{}} onAction={()=>{}} actors={{in:'Wael'}}/>);
    expect(none).not.toContain('op-by');
  });
});
