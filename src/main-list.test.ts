import {readFileSync} from 'node:fs';import {expect,it} from 'vitest';
const s=readFileSync('src/main.tsx','utf8');
it('main list is compact and ParkingPro-like',()=>{
 expect(s).not.toMatch(/Aktuelle DUS-Flugtafel|FAHRTEN<|NACH UHRZEIT SORTIERT|className="live-note"|className="list-heading"><span>\{visible/);
 expect(s).not.toContain('className="filter chosen');
 expect(s).toMatch(/className="cam-search"/);expect(s).toContain('setScanOpen(true)');expect(s).toContain('<BookingScanSheet onLookup={onScan}');expect(s).not.toContain('Kennzeichenerkennung noch nicht verfügbar');
 expect(s).toMatch(/date\.split\('-'\)\.reverse\(\)\.join\('\.'\)/);expect(s).toMatch(/date!==day\(\)&&<button className="today-btn"/);
 expect(s).toContain('<PrintSheetsButton items={visible} date={date}');expect(s).not.toMatch(/CSV exportieren/);
 expect((s.match(/aria-label=\{tr\("Filter"\)\}/g)||[]).length).toBe(1);
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
 const blk=c.slice(c.indexOf('/* Main list: header')).replace(/\/\*[\s\S]*?\*\//g,'');expect(blk).not.toMatch(/blur|backdrop|box-shadow|opacity/);
 expect(s.indexOf('className="counters"')).toBeLessThan(s.indexOf('className="booking-list"'));
});

it('scan wiring + footer hidden in fixed-top shell',()=>{expect(s).toContain('resolveScan(q,visible.map(e=>e.b),rows');expect(s).toContain('<ScanResult outcome={scanOut}');expect(readFileSync('src/main-list.css','utf8')).toContain('.app.fixed-top .page>footer{display:none}')});

it('booking-list is a positioned containing block so absolute children cannot extend the page',()=>{expect(readFileSync('src/main-list.css','utf8')).toContain('.booking-list{position:relative;')});

it('scan focus fills search with code, scrolls row, never opens detail or touches filters',()=>{const m=readFileSync('src/main.tsx','utf8');expect(m).toContain('const focusBooking=(b:Booking)=>{setQuery(b.code);setFocusId(b.id)}');expect(m).toMatch(/if\(o\.status==='single'\)\{setScanOut\(null\);focusBooking\(o\.booking\)\}/);expect(m).not.toMatch(/focusBooking=[^;]*open\(/);expect(m).not.toMatch(/focusBooking=[^;]*setMf/);expect(m).toContain('return day(resolveEventTime(b,k,mf.flights')});

it('direction chips persist through the user filter setter',()=>{expect(s).toContain("const setType=(t:MainBookingFilters['type'])=>changeMf({...mf,type:t})");expect(s).not.toContain('setType=(t:string)=>setMf')});

it('choosing a hidden ambiguous match asks for its explicit date jump before touching search',()=>{expect(s).toContain("if(visible.some(e=>e.b.id===b.id)){setScanOut(null);focusBooking(b)}else setScanOut({status:'outside',bookings:[b],jumpDate:scanBookingDay(b)})");expect(s).toContain('rows,scanBookingDay')});

it('main-compact.css loads last and sets 85/55/4 row',()=>{const s=readFileSync('src/main.tsx','utf8');expect(s.indexOf("main-compact.css")).toBeGreaterThan(s.indexOf("main-list.css"));const c=readFileSync('src/main-compact.css','utf8');expect(c).toContain('grid-template-columns:55px');expect(c).toContain('min-height:85px');expect(c).toContain('border-left-width:4px');expect(c).toMatch(/\.blr-search|search input\{font-size:16px/)});
