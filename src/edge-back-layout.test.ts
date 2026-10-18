import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
it('extends secondary-page gesture roots to the viewport without changing the fixed bookings shell',()=>{
 const css=readFileSync('src/edge-back.css','utf8');
 expect(css).toMatch(/\.app:not\(\.fixed-top\)\s*>\s*\.workspace\s*\{\s*min-height:\s*100vh;\s*min-height:\s*100dvh;/);
});
