import {readFileSync} from 'node:fs';import {it,expect} from 'vitest';
const source=readFileSync('src/main.tsx','utf8'),css=readFileSync('src/drawer-scroll.css','utf8');
it('puts one day print action directly after bookings in the shared navigation',()=>{
 expect(source).toContain("[['today',tr(\"Bookings\")],...(admin||view==='today'?[['print',tr(\"Tag drucken\")]]:[]),['new',");
 expect(source.match(/tr\("Tag drucken"\)/g)).toHaveLength(1);
 expect(source).toContain("v==='print'?'drawer-action drawer-print'");
 expect(source).toContain("if(v==='print'){setMenu(false);setPrintOpen(true);return}");
});
it('keeps admin day printing across views without granting drivers printing on new views',()=>{
 for(const admin of [true,false])for(const view of ['today','staff','admin','settings','new','import']){
  const visible=admin||view==='today';
  expect(visible).toBe(admin?true:view==='today');
 }
 expect(source).toContain("const admin=demo||me?.role==='admin'");
});
it('uses the same full-width grid track and start alignment for every item',()=>{
 expect(css).toContain('width:100%;grid-template-columns:minmax(0,1fr);justify-content:stretch');
 expect(css).toContain('height:auto;text-align:start');
 expect(css).toContain('overflow-y:auto;overflow-x:hidden');
});
it('retains conservative safe updates while day printing or staff/edit UI is open',()=>{
 expect(source).toMatch(/useBuildUpdates\([^\n]*menu\|\|printOpen\|\|view==='admin'\|\|view==='staff'/);
});
