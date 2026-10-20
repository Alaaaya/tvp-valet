import {t as tr} from './i18n';
import {db} from '../api';

export const STAFF_DOMAIN='staff.tvp-valet.de';
export type StaffRole='admin'|'driver';
export interface StaffAccount{id:string;full_name:string;email:string|null;role:StaffRole;active:boolean}

/** Login field accepts a username or an e-mail. Usernames get the staff domain appended. */
export function loginEmail(value:string):string{
  const v=value.trim();
  return v.includes('@')?v:v.toLowerCase()+'@'+STAFF_DOMAIN;
}
/** Username shown in settings: local part for staff-domain accounts, otherwise the full e-mail. */
export function staffUsername(email:string|null|undefined):string{
  if(!email)return '';
  const at=email.lastIndexOf('@');
  return at>0&&email.slice(at+1).toLowerCase()===STAFF_DOMAIN?email.slice(0,at):email;
}
export interface StaffDraft{full_name:string;username:string;password:string;role:StaffRole}
export type StaffDraftErrors=Partial<Record<keyof StaffDraft,string>>;
export const USERNAME_RE=/^[a-z0-9._-]{3,32}$/;
export const PASSWORD_MAX_BYTES=72;
export const passwordBytes=(p:string)=>new TextEncoder().encode(p).length;
export function validatePassword(p:string):string|undefined{
  if(p.length<8)return tr("Passwort: mindestens 8 Zeichen.");
  if(passwordBytes(p)>PASSWORD_MAX_BYTES)return tr("Passwort: höchstens 72 Bytes (Sonderzeichen zählen mehrfach).");
  return undefined;
}
export function validateStaffDraft(d:StaffDraft,existing:Pick<StaffAccount,'email'>[]=[]):StaffDraftErrors{
  const e:StaffDraftErrors={},name=d.full_name.trim(),user=d.username.trim().toLowerCase();
  if(name.length<1||name.length>120)e.full_name=tr("Name: 1 bis 120 Zeichen.");
  if(!USERNAME_RE.test(user))e.username=tr("Benutzername: 3–32 Zeichen, nur a–z, 0–9, Punkt, Unterstrich, Bindestrich.");
  else if(existing.some(s=>(s.email||'').toLowerCase()===user+'@'+STAFF_DOMAIN))e.username=tr("Benutzername ist bereits vergeben.");
  const pw=validatePassword(d.password);if(pw)e.password=pw;
  if(d.role!=='admin'&&d.role!=='driver')e.role=tr("Ungültige Rolle.");
  return e;
}
/** Translate backend error messages into clear German/English/Arabic text. */
export function staffError(e:unknown):string{
  const m=e instanceof Error?e.message:typeof e==='object'&&e&&'message' in e?String((e as {message:unknown}).message):String(e);
  if(/already exists|duplicate/i.test(m))return tr("Benutzername ist bereits vergeben.");
  if(/last active admin/i.test(m))return tr("Der letzte aktive Admin kann nicht deaktiviert oder herabgestuft werden.");
  if(/Admin access required/i.test(m))return tr("Nur Admins dürfen Mitarbeiter verwalten.");
  if(/Could not find the function|schema cache|PGRST202/i.test(m))return tr("Mitarbeiterkonten sind im Backend noch nicht eingerichtet (SQL ausführen).");
  if(/72/.test(m)&&/byte|octet/i.test(m))return tr("Passwort: höchstens 72 Bytes (Sonderzeichen zählen mehrfach).");
  if(/at least 8/i.test(m))return tr("Passwort: mindestens 8 Zeichen.");
  return m;
}
function need(){if(!db)throw Error(tr("Backend nicht eingerichtet"));return db}
export async function listStaffAccounts():Promise<StaffAccount[]>{
  const {data,error}=await need().from('profiles').select('id,full_name,email,role,active').order('full_name');
  if(error)throw error;return data as StaffAccount[];
}
export async function createStaffAccount(d:StaffDraft):Promise<StaffAccount>{
  const {data,error}=await need().rpc('admin_create_staff',{p_username:d.username.trim().toLowerCase(),p_full_name:d.full_name.trim(),p_password:d.password,p_role:d.role});
  if(error)throw error;return data as StaffAccount;
}
export async function setStaffPassword(id:string,password:string):Promise<void>{
  const {error}=await need().rpc('admin_set_staff_password',{p_user_id:id,p_password:password});if(error)throw error;
}
export async function updateStaffAccount(s:StaffAccount,patch:Partial<Pick<StaffAccount,'role'|'active'>>):Promise<StaffAccount>{
  const {data,error}=await need().rpc('manage_employee',{p_user_id:s.id,p_display_name:s.full_name,p_role:patch.role??s.role,p_active:patch.active??s.active});
  if(error)throw error;return data as StaffAccount;
}
