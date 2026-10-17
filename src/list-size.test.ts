import{readFileSync}from'node:fs';import{expect,it}from'vitest';
it('scales list layout without transforms while preserving plate and touch safety',()=>{
 const c=readFileSync('src/list-size.css','utf8'),m=readFileSync('src/main.tsx','utf8');
 expect(c).toContain('height:calc(85px * var(--list-scale))');
 expect(c).toContain('calc(55px * var(--list-scale))');
 expect(c).toContain('color:#111');
 expect(c).toContain('font-size:max(16px,16px * var(--list-scale))');
 expect(c).toContain('height:max(44px,44px * var(--list-scale))');
 expect(c).not.toMatch(/transform\s*:/);
 expect(m).toContain('aria-describedby="list-size-help"');
 expect(m).toContain('type="radio" name="list-size"');
 expect(m).toContain('readListSize(window.localStorage)');
 expect(m).toContain('writeListSize(window.localStorage,v)');
});
