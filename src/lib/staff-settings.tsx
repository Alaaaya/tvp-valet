import {t as tr} from './i18n';
import React,{useCallback,useEffect,useState} from 'react';
import {STAFF_DOMAIN,createStaffAccount,listStaffAccounts,setStaffPassword,staffError,staffUsername,updateStaffAccount,validatePassword,validateStaffDraft,type StaffAccount,type StaffDraft,type StaffDraftErrors,type StaffRole} from './staff-accounts';
import '../staff-settings.css';

export interface StaffApi{
  list:()=>Promise<StaffAccount[]>;
  create:(d:StaffDraft)=>Promise<StaffAccount>;
  setPassword:(id:string,pw:string)=>Promise<void>;
  update:(s:StaffAccount,patch:Partial<Pick<StaffAccount,'role'|'active'>>)=>Promise<StaffAccount>;
}
export const liveStaffApi:StaffApi={list:listStaffAccounts,create:createStaffAccount,setPassword:setStaffPassword,update:updateStaffAccount};
/** Local-only API for the dev demo (nothing is stored). */
export function demoStaffApi(seed:StaffAccount[]):StaffApi{
  let rows=seed.map(s=>({...s}));
  return {
    list:async()=>rows.map(s=>({...s})),
    create:async d=>{const s:StaffAccount={id:'demo-'+d.username,full_name:d.full_name.trim(),email:d.username.trim().toLowerCase()+'@'+STAFF_DOMAIN,role:d.role,active:true};rows=[...rows,s];return s},
    setPassword:async()=>{},
    update:async(s,p)=>{const n={...s,...p};if(s.role==='admin'&&s.active&&(n.role!=='admin'||!n.active)&&!rows.some(r=>r.id!==s.id&&r.role==='admin'&&r.active))throw Error('Cannot disable or demote the last active admin');rows=rows.map(r=>r.id===s.id?n:r);return n}
  };
}
const EMPTY:StaffDraft={full_name:'',username:'',password:'',role:'driver'};

export function StaffSettings({api,meId,onChanged}:{api:StaffApi;meId?:string;onChanged?:()=>void}){
  const [list,setList]=useState<StaffAccount[]|null>(null),[err,setErr]=useState(''),[ok,setOk]=useState('');
  const [draft,setDraft]=useState<StaffDraft>(EMPTY),[errs,setErrs]=useState<StaffDraftErrors>({}),[busy,setBusy]=useState('');
  const [pwFor,setPwFor]=useState(''),[pw,setPw]=useState(''),[pwErr,setPwErr]=useState('');
  const reload=useCallback(async()=>{try{setList(await api.list())}catch(e){setErr(staffError(e))}},[api]);
  useEffect(()=>{void reload()},[reload]);
  async function act(key:string,fn:()=>Promise<unknown>,done:string){setBusy(key);setErr('');setOk('');try{await fn();setOk(done);await reload();onChanged?.()}catch(e){setErr(staffError(e))}finally{setBusy('')}}
  async function add(e:React.FormEvent){e.preventDefault();const v=validateStaffDraft(draft,list||[]);setErrs(v);if(Object.keys(v).length)return;
    await act('add',async()=>{await api.create(draft);setDraft(EMPTY)},tr("Mitarbeiter angelegt."))}
  async function savePw(s:StaffAccount){const v=validatePassword(pw);setPwErr(v||'');if(v)return;await act('pw:'+s.id,async()=>{await api.setPassword(s.id,pw);setPwFor('');setPw('')},tr("Passwort geändert."))}
  const field=(k:keyof StaffDraft)=>errs[k]?<small className="staff-field-err" role="alert">{errs[k]}</small>:null;
  return <section className="staff-settings" aria-label={tr("Mitarbeiter")}>
    <h3>{tr("Mitarbeiter")}</h3>
    <p className="muted">{tr("Jeder Mitarbeiter meldet sich mit eigenem Benutzernamen und Passwort an. Check-in, Check-out, Abholen, Zurückbringen und Anrufe werden unter seinem Namen gespeichert.")}</p>
    {err&&<p className="error staff-err" role="alert">{err}</p>}
    {ok&&<p className="staff-ok" role="status">{ok}</p>}
    {!list?<p className="muted">{tr("Lädt…")}</p>:<ul className="staff-list">{list.map(s=>{const me=s.id===meId;return <li key={s.id} className={s.active?'':'inactive'}>
      <div className="staff-head"><strong>{s.full_name}{me&&<small> {tr("(du)")}</small>}</strong><span className="staff-user"><bdi>{staffUsername(s.email)||'–'}</bdi></span>
        <span className={'staff-badge '+(s.active?'on':'off')}>{s.active?tr("Aktiv"):tr("Inaktiv")}</span></div>
      <div className="staff-actions">
        <select aria-label={tr("Rolle ")+s.full_name} value={s.role} disabled={!!busy} onChange={e=>void act('role:'+s.id,()=>api.update(s,{role:e.target.value as StaffRole}),tr("Rolle geändert."))}><option value="driver">{tr("Fahrer")}</option><option value="admin">{tr("Admin")}</option></select>
        <button type="button" className="outline" disabled={!!busy} onClick={()=>{setPwFor(pwFor===s.id?'':s.id);setPw('');setPwErr('')}}>{tr("Neues Passwort")}</button>
        <button type="button" className="outline" disabled={!!busy||(me&&s.active)} onClick={()=>void act('act:'+s.id,()=>api.update(s,{active:!s.active}),s.active?tr("Mitarbeiter deaktiviert."):tr("Mitarbeiter aktiviert."))}>{s.active?tr("Deaktivieren"):tr("Aktivieren")}</button>
      </div>
      {pwFor===s.id&&<div className="staff-pw"><input type="password" autoComplete="new-password" aria-label={tr("Neues Passwort für ")+s.full_name} placeholder={tr("Neues Passwort (min. 8 Zeichen)")} value={pw} onChange={e=>setPw(e.target.value)}/><button type="button" className="primary" disabled={!!busy} onClick={()=>void savePw(s)}>{tr("Speichern")}</button>{pwErr&&<small className="staff-field-err" role="alert">{pwErr}</small>}</div>}
    </li>})}</ul>}
    <form className="staff-add" onSubmit={add} noValidate>
      <h4>{tr("Mitarbeiter hinzufügen")}</h4>
      <label>{tr("Name")}<input value={draft.full_name} maxLength={120} onChange={e=>setDraft({...draft,full_name:e.target.value})}/>{field('full_name')}</label>
      <label>{tr("Benutzername")}<input value={draft.username} maxLength={32} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" onChange={e=>setDraft({...draft,username:e.target.value.toLowerCase()})}/>{field('username')}</label>
      <label>{tr("Passwort")}<input type="password" autoComplete="new-password" value={draft.password} onChange={e=>setDraft({...draft,password:e.target.value})}/>{field('password')}</label>
      <label>{tr("Rolle")}<select value={draft.role} onChange={e=>setDraft({...draft,role:e.target.value as StaffRole})}><option value="driver">{tr("Fahrer")}</option><option value="admin">{tr("Admin")}</option></select></label>
      <button className="primary" disabled={!!busy}>{busy==='add'?tr("Wird gespeichert …"):tr("Mitarbeiter anlegen")}</button>
    </form>
  </section>;
}
export default StaffSettings;
