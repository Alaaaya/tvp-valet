// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {validatePassword,loginEmail,staffUsername,validateStaffDraft,staffError,STAFF_DOMAIN} from './staff-accounts';
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
    expect(t).toContain('Alaa');expect(t).toContain('alaa@gmail.com');expect(t).toContain('wael');expect(t).toContain('wael@staff.tvp-valet.de');expect(t).toContain('Inaktiv');
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
    const cf=vi.spyOn(window,'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    await act(async()=>{type(input,'neuesPass1');});await act(async()=>save.click());expect(setPw).not.toHaveBeenCalled();expect(cf.mock.calls[0][0]).toContain('Wael');
    await act(async()=>save.click());expect(setPw).toHaveBeenCalledWith('d1','neuesPass1');expect((host.querySelector('.staff-pw input') as HTMLInputElement|null)?.value||'').toBe('');
    cf.mockRestore();
  });
  it('rejects passwords over 72 UTF-8 bytes',()=>{
    const ok={full_name:'W',username:'wael',role:'driver' as const};
    expect(validateStaffDraft({...ok,password:'a'.repeat(72)}).password).toBeUndefined();
    expect(validateStaffDraft({...ok,password:'a'.repeat(73)}).password).toMatch(/72/);
    expect(validateStaffDraft({...ok,password:'ä'.repeat(37)}).password).toMatch(/72/);
  });
  it('blocks double submit and mutation when session changed',async()=>{
    const api=demoStaffApi(seed);let n=0;api.create=async d=>{n++;await new Promise(r=>setTimeout(r,20));return {id:'x',full_name:d.full_name,email:'s@x',role:'driver',active:true}};
    host=document.createElement('div');document.body.append(host);root=createRoot(host);const cs=vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    await act(async()=>root!.render(<StaffSettings api={api} meId="a1" checkSession={cs}/>));await act(async()=>{});
    const form=host.querySelector('form.staff-add') as HTMLFormElement,inputs=form.querySelectorAll('input');
    await act(async()=>{type(inputs[0],'Saleh');type(inputs[1],'saleh');type(inputs[2],'geheim123')});
    await act(async()=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,40))});
    expect(n).toBe(1);
    await act(async()=>{type(inputs[0],'Omar');type(inputs[1],'omar');type(inputs[2],'geheim123')});
    await act(async()=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
    expect(n).toBe(1);expect(host.querySelector('.staff-err')?.textContent).toMatch(/Sitzung/);
  });
  it('clears inputs and reloads on account change',async()=>{
    const api=demoStaffApi(seed);host=document.createElement('div');document.body.append(host);root=createRoot(host);
    await act(async()=>root!.render(<StaffSettings api={api} meId="a1"/>));await act(async()=>{});
    await act(async()=>type(host.querySelectorAll('form.staff-add input')[2] as HTMLInputElement,'geheim123'));
    await act(async()=>root!.render(<StaffSettings api={api} meId="b2"/>));await act(async()=>{});
    expect((host.querySelectorAll('form.staff-add input')[2] as HTMLInputElement).value).toBe('');
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
    expect(h.match(/class="op-by( inline)?"/g)?.length).toBe(2);expect(h).not.toContain('<bdi>Alaa</bdi>');
    expect(h).toMatch(/class="op-by">[^<]*<bdi>Wael<\/bdi>/);expect(h).toMatch(/class="op-at">[^<]*<span class="op-by inline">/);expect(h).toContain('<bdi>Saleh</bdi>');expect(h).toContain('has-by');
    const none=r(<BookingDetailView booking={{...b,checked_in_at:null}} known flightIn={null} flightOut={null} onBack={()=>{}} onEdit={()=>{}} onStartCheck={()=>{}} onAction={()=>{}} actors={{in:'Wael'}}/>);
    expect(none).not.toContain('op-by');
  });
});

describe('role change with async checkSession',()=>{
  it('promotes a driver to admin even when checkSession resolves later',async()=>{
    const seed=[{id:'a1',full_name:'Alaa',email:'alaa@gmail.com',role:'admin' as const,active:true},{id:'d1',full_name:'Wael',email:'wael@staff.tvp-valet.de',role:'driver' as const,active:true}];
    const base=demoStaffApi(seed),update=vi.fn(base.update);const api:StaffApi={...base,update};
    const cs=vi.fn(async()=>{await new Promise(r=>setTimeout(r,5));return true});
    host=document.createElement('div');document.body.append(host);root=createRoot(host);
    await act(async()=>root!.render(<StaffSettings api={api} meId="a1" checkSession={cs}/>));await act(async()=>{});
    const sel=host.querySelector('select[aria-label="Rolle Wael"]') as HTMLSelectElement;
    await act(async()=>{type(sel,'admin')});
    await act(async()=>{await new Promise(r=>setTimeout(r,30))});await act(async()=>{});
    expect(cs).toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);expect(update.mock.calls[0][1]).toEqual({role:'admin'});
    expect((host.querySelector('select[aria-label="Rolle Wael"]') as HTMLSelectElement).value).toBe('admin');
  });
});

describe('late results and codepoint limits',()=>{
  const seed=[{id:'a1',full_name:'Alaa',email:'alaa@gmail.com',role:'admin' as const,active:true},{id:'d1',full_name:'Wael',email:'wael@staff.tvp-valet.de',role:'driver' as const,active:false}];
  it('late create from old account does not wipe the new account draft',async()=>{
    let resolve!:(v:any)=>void;const base=demoStaffApi(seed);
    const api:StaffApi={...base,create:()=>new Promise(res=>{resolve=res})};
    await mount(api);
    const form=()=>host.querySelector('form.staff-add') as HTMLFormElement;const ins=()=>form().querySelectorAll('input');
    await act(async()=>{type(ins()[0],'Saleh');type(ins()[1],'saleh');type(ins()[2],'geheim123')});
    await act(async()=>form().dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    await act(async()=>root!.render(<StaffSettings api={api} meId="b2"/>));await act(async()=>{});
    await act(async()=>{type(ins()[0],'Neu');type(ins()[1],'neu');type(ins()[2],'neues-pass1')});
    await act(async()=>{resolve({id:'x',full_name:'Saleh',email:'saleh@staff.tvp-valet.de',role:'driver',active:true})});await act(async()=>{});
    expect(ins()[0].value).toBe('Neu');expect(ins()[1].value).toBe('neu');expect(ins()[2].value).toBe('neues-pass1');
  });
  it('late password reset from old account does not wipe the new password input',async()=>{
    let resolve!:(v?:any)=>void;const base=demoStaffApi(seed);
    const api:StaffApi={...base,setPassword:()=>new Promise<void>(res=>{resolve=res})};
    vi.spyOn(window,'confirm').mockReturnValue(true);
    await mount(api);
    const open=()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Neues Passwort') as HTMLButtonElement;
    await act(async()=>open().click());
    const pwIn=()=>host.querySelector('.staff-pw input') as HTMLInputElement;
    await act(async()=>type(pwIn(),'altespass1'));
    await act(async()=>(host.querySelector('.staff-pw .primary') as HTMLButtonElement).click());
    await act(async()=>root!.render(<StaffSettings api={api} meId="b2"/>));await act(async()=>{});
    await act(async()=>open().click());await act(async()=>type(pwIn(),'neuespass2'));
    await act(async()=>{resolve()});await act(async()=>{});
    expect(pwIn().value).toBe('neuespass2');
  });
  it('counts code points: 4 emoji rejected, 7 rejected, 8 accepted (32 bytes)',()=>{
    expect(validatePassword('😀'.repeat(4))).toBeTruthy();expect(validatePassword('😀'.repeat(7))).toBeTruthy();expect(validatePassword('😀'.repeat(8))).toBeUndefined();
  });
  it('72 bytes accepted, 73 rejected',()=>{
    expect(validatePassword('a'.repeat(72))).toBeUndefined();expect(validatePassword('a'.repeat(73))).toBeTruthy();
    expect(validatePassword('😀'.repeat(18))).toBeUndefined();expect(validatePassword('😀'.repeat(19))).toBeTruthy();
  });
});
