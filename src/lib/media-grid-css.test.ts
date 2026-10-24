import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
const css=readFileSync('src/booking-detail.css','utf8');
it('media grid tile rule never sizes the hidden file input',()=>{
  expect(css).toContain('.detail-media .mg-grid>:not(.sr-only):not(.mc-q){aspect-ratio:1;width:100%;height:auto');
  expect(css).toMatch(/\.detail-media \.mg-grid>\.sr-only\{position:absolute/);
});
it('plus tile follows the grid width, not a fixed 57px override',()=>{
  const ref=readFileSync('src/reference-match-detail-style.css','utf8');
  expect(ref).toMatch(/\.mg-grid>\.upload\{width:100%!important;height:auto!important;aspect-ratio:1!important;min-width:0!important;min-height:0!important/);
  expect(ref).not.toMatch(/\.mg-grid>\.upload[^{]*\{width:57px/);
});
