import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
it('applies owner black plate override only to main-list plate text',()=>{
 const css=readFileSync('src/main-compact.css','utf8');
 expect(css).toContain('.app.fixed-top .blr-plate{color:#111}');
 expect(css).not.toMatch(/\.blr-plate[^{}]*svg[^{}]*\{[^}]*color:#111/);
});
