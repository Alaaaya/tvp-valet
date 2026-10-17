import {readFileSync} from 'node:fs';import {expect,it} from 'vitest';
const s=readFileSync('src/main.tsx','utf8');
const fn=s.slice(s.indexOf('async function saveEdit'),s.indexOf('async function gearAct'));
it('safe edit uses the frozen edit-start snapshot, never the latest refreshed row',()=>{
 expect(fn).toMatch(/orig:selected\}/);
 expect(fn).not.toMatch(/orig:known/);
 expect(fn).toMatch(/saveEditedBooking\(o,\{\.\.\.o,\.\.\.patch\},editReq\.current\.id\)/);
 expect(fn).toMatch(/selected\.edit_revision/);
});
it('selected is not replaced by refreshed rows while editing',()=>{expect(s).toMatch(/if\(!s\|\|editing\)return s/)});
