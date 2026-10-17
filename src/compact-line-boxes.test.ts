import{readFileSync}from'node:fs';import{expect,it}from'vitest';
it('compact full-metadata rows preserve explicit line boxes and full plates',()=>{const c=readFileSync('src/main-compact.css','utf8');for(const token of ['gap:1px;padding:2px 0;line-height:11px','min-height:13px;line-height:11px','min-height:15px;line-height:15px','min-height:14px;line-height:14px','min-height:12px;line-height:12px'])expect(c).toContain(token);expect(c).not.toMatch(/transform\s*:|\.blr-calls\{[^}]*display:none/);expect(readFileSync('src/booking-list-row.css','utf8')).toContain('.blr-l2 .blr-plate{flex:0 0 auto;max-width:none;overflow:visible')});
it('bounds full metadata rows and keeps call dates on a single secondary line',()=>{
 const c=readFileSync('src/main-compact.css','utf8');
 expect(c).toContain('height:85px;max-height:85px;overflow:hidden');
 expect(c).toContain('flex-wrap:nowrap;white-space:nowrap;overflow:hidden;max-height:12px');
 expect(c).toContain('.cc-date{flex-basis:auto');
});
