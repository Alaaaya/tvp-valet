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
