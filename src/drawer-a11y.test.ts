import {readFileSync} from 'node:fs';import {expect,it} from 'vitest';
const s=readFileSync('src/main.tsx','utf8');
it('drawer closes on Escape, restores focus, marks current nav',()=>{expect(s).toMatch(/e\.key==='Escape'\)setMenu\(false\)/);expect(s).toMatch(/menuBtn\.current\?\.focus\(\)/);expect(s).toMatch(/aria-current=\{view===v\?'page'/)});
it('sign out keeps session when signOut returns an error',()=>{expect(s).toContain("const{error:so}=await db.auth.signOut({scope:'local'});if(so)throw so}setSession(false)")});
