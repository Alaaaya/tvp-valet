import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
const css=readFileSync('src/booking-detail.css','utf8');
it('media grid tile rule never sizes the hidden file input',()=>{
  expect(css).toContain('.detail-media .mg-grid>:not(.sr-only):not(.mc-q){aspect-ratio:1');
  expect(css).toMatch(/\.detail-media \.mg-grid>\.sr-only\{position:absolute/);
});
