import {readFileSync} from 'node:fs';import {expect,it} from 'vitest';
const s=readFileSync('src/main.tsx','utf8');
it('main list is compact and ParkingPro-like',()=>{
 expect(s).not.toMatch(/Aktuelle DUS-Flugtafel|FAHRTEN<|NACH UHRZEIT SORTIERT|className="live-note"|className="list-heading"><span>\{visible/);
 expect(s).not.toContain('className="filter chosen');
 expect(s).toMatch(/className="cam-search"/);expect(s).not.toMatch(/ocr/i);expect(s).toContain("setNotice('Kennzeichenerkennung noch nicht verfügbar')");expect(s).toMatch(/className="cam-search"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*className="cam-search"|className="cam-search" aria-disabled/);
 expect(s).toMatch(/date\.split\('-'\)\.reverse\(\)\.join\('\.'\)/);expect(s).toMatch(/date!==day\(\)&&<button className="today-btn"/);
 expect(s).toMatch(/const exportCsv=/);expect(s).toMatch(/CSV exportieren/);
 expect((s.match(/aria-label="Filter"/g)||[]).length).toBe(1);
 expect(s.indexOf('className="counters"')).toBeLessThan(s.indexOf('className="search-row"'));
 expect(s.indexOf('className="search-row"')).toBeLessThan(s.indexOf('className="date-strip"'));
});
it('main-list.css loads after style.css, today button 44px',()=>{expect(s.indexOf("import './main-list.css'")).toBeGreaterThan(s.indexOf("import'./style.css'"));const c=readFileSync('src/main-list.css','utf8');expect(c).toMatch(/today-btn\{[^}]*min-height:44px/);expect(c).not.toMatch(/min-height:36px/)});

it('fixed-top shell: only booking-list scrolls, opaque',()=>{
 const c=readFileSync('src/main-list.css','utf8');
 expect(s).toContain('(view==="today"?" fixed-top":"")');
 expect(c).toMatch(/\.app\.fixed-top\{height:100dvh;min-height:0;overflow:hidden\}/);
 expect(c).toMatch(/\.fixed-top \.workspace\{height:100dvh;display:flex;flex-direction:column;min-height:0/);
 expect(c).toMatch(/\.fixed-top \.page>\.booking-list\{[^}]*flex:1 1 auto;min-height:0;overflow-y:auto/);
 expect(c).toContain('env(safe-area-inset-bottom)');
 const blk=c.slice(c.indexOf('/* Main list: header'));expect(blk).not.toMatch(/blur|backdrop|box-shadow|opacity/);
 expect(s.indexOf('className="counters"')).toBeLessThan(s.indexOf('className="booking-list"'));
});
