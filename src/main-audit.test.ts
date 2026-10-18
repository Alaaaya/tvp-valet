import {readFileSync} from 'node:fs';import {expect,it} from 'vitest';import {validateMedia} from './lib/handover-api';
const s=readFileSync('src/main.tsx','utf8');
it('customer search input has an accessible name',()=>{expect(s).toMatch(/<input aria-label="Alle Buchungen durchsuchen" type="search"/)});
it('login inputs keep autofill attributes and required',()=>{expect(s).toMatch(/type="email" required autoComplete="username"/);expect(s).toMatch(/type="password" required autoComplete="current-password"/)});
it('sign out is local scope, respects unsaved guard and resets session state',()=>{expect(s).toContain("signOut({scope:'local'})");expect(s).toMatch(/drawer-signout" onClick=\{\(\)=>\{if\(!canLeavePage\(\)\)return;run/);expect(s).not.toMatch(/signOut\(\)/);expect(s).toMatch(/signOut\(\{scope:'local'\}\);if\(so\)throw so\}setSession\(false\);setDemo\(false\);resetSessionState\(\)/)});
it('resetSessionState clears per-user state and runs when the user id changes',()=>{const m=s.slice(s.indexOf('const resetSessionState='),s.indexOf('const[gear,setGear]'));for(const k of ['setSelected(null)','setEditing(false)','setGear(false)','setCallAsk(false)','setFlow(null)','setStaff([])','setRows([])','setOps({})','setPhotos([])',"setQuery('')","setPassword('')",'setMe(null)'])expect(m).toContain(k);expect(s).toMatch(/uid!==sessionUid\.current\)\{sessionUid\.current=uid;resetSessionState\(\)/)});
it('main upload allows only jpeg/png/webp with matching extension',()=>{expect(s).toContain("validateMedia(file,'photo')");expect(s).not.toMatch(/file\.type\.startsWith\('image\/'\)/);expect(s).toContain('accept="image/jpeg,image/png,image/webp"');expect(s).toContain("contentType:mime");expect(s).toContain("mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg'");
 for(const type of ['image/svg+xml','image/gif','text/html','image/heic','application/pdf',''])expect(()=>validateMedia(new File(['x'],'a',{type}),'photo')).toThrow();
 for(const type of ['image/jpeg','image/png','image/webp'])expect(validateMedia(new File(['x'],'a',{type}),'photo')).toBe(type)});
it('identity switches synchronously invalidate old booking and flight work before resetting state',()=>{
 expect(s).toContain("sessionUid.current=uid;resetSessionState();setAuthUid(uid)");
 expect(s).toContain('bookingGeneration.current++;flightGeneration.current++;opsReq.current++;bookingCtl.current?.abort();flightCtl.current?.abort()');
 expect(s).toContain('&&uid===sessionUid.current');
 expect(s).toContain("auth.data.session?.user.id!==uid");
 expect(s).toContain('},[session,authUid,demo])');
 expect(s).toContain('[date,mf,query,view,session,authUid,demo,selected?.id]');
});
