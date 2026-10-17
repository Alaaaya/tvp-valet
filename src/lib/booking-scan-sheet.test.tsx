import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {BookingScanSheet} from './booking-scan-sheet';
const src=readFileSync(new URL('./booking-scan-sheet.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../booking-scan.css',import.meta.url),'utf8');
describe('BookingScanSheet',()=>{
  const h=r(<BookingScanSheet onLookup={()=>{}} onClose={()=>{}}/>);
  it('shows Scan title with QR code and License plate rows and close',()=>{
    expect(h).toContain('>Scan<');expect(h).toContain('QR code');expect(h).toContain('License plate');expect(h).toContain('aria-label="Schließen"');expect(h).toContain('aria-modal="true"');
  });
  it('is opaque with no blur',()=>{expect(css).not.toMatch(/blur|backdrop-filter|filter:/);expect(css).toMatch(/\.bsc\{[^}]*background:#fff/)});
  it('never navigates or evals',()=>{expect(src).not.toMatch(/location\.|window\.open|eval\(|new Function|dangerouslySetInnerHTML|href=/)});
  it('stops camera tracks on unmount and guards stale starts',()=>{
    expect(src).toMatch(/getTracks\(\)\.forEach\(t=>t\.stop\(\)\)/);expect(src).toMatch(/my!==gen\.current\|\|!mounted\.current\)\{s\.getTracks/);
    expect(src).toMatch(/return\(\)=>\{document\.removeEventListener\('visibilitychange',vis\);cancelAnimationFrame\(raf\);clearTimeout\(timer\);stop\(\)\}/);
  });
  it('revokes object URLs, aborts and disposes OCR on unmount',()=>{
    expect(src).toContain('URL.revokeObjectURL(preview)');expect(src).toMatch(/ctl\.current\?\.abort\(\);void ocr\.current\?\.dispose\(\)/);
  });
  it('lookup only after explicit confirmation submit',()=>{
    expect(src.match(/onLookup\(/g)?.length).toBe(1);expect(src).toMatch(/onSubmit=\{e=>\{e\.preventDefault\(\);go\(\)\}\}/);
  });
  it('image loader falls back to HTMLImageElement and guards pixels',()=>{const q=readFileSync(new URL('./booking-scan-qr.ts',import.meta.url),'utf8');expect(q).toMatch(/typeof createImageBitmap==='function'/);expect(q).toContain('new Image()');expect(q).toContain('URL.revokeObjectURL(url)');expect(q).toContain('MAX_PIXELS')});
  it('photo decode race: per-file token, bumped by handle()->stop(), manual result and unmount',()=>{
    expect(src).toContain('const job=++fileJob.current');expect(src).toMatch(/job!==fileJob\.current\)return/);expect(src).toMatch(/gen\.current\+\+;fileJob\.current\+\+/);expect(src).toMatch(/stop\(\);onFound\(\{kind:'qr'/);
  });
  it('QR confirmation uses full code validation; plate preview only after file validation',()=>{
    expect(src).toContain("isValidBookingCode(v.trim())");
    expect(src.indexOf('validateImageFile(f)}catch')).toBeGreaterThan(0);expect(src.indexOf('validateImageFile(f)}catch')).toBeLessThan(src.indexOf('URL.createObjectURL(f)'));
  });
  it('file input uses environment capture',()=>{expect(src.match(/capture="environment"/g)?.length).toBe(2)});
});
