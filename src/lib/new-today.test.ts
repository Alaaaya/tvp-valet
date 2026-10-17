import {describe,expect,it} from 'vitest';
import {createdOn,newTodaySummary,todayCreatedCount,shiftDate,shortDate,IMPORT_NOTE} from './new-today';
const b=(id:string,created:string,arr='2026-10-20T08:00:00Z'):any=>({id,created_at:created,arrival_at:arr});
describe('new today',()=>{
  const rows=[b('a','2026-10-16T22:30:00Z'),b('b','2026-10-17T21:59:59Z'),b('c','2026-10-17T22:00:00Z'),b('d','2026-10-17T10:00:00Z','2026-10-17T12:00:00Z')];
  it('filters by Berlin created day, not UTC',()=>{expect(createdOn(rows,'2026-10-17').map(r=>r.id)).toEqual(['b','d','a']);expect(createdOn(rows,'2026-10-18').map(r=>r.id)).toEqual(['c'])});
  it('16th 22:30Z is 17th local in CEST',()=>{expect(createdOn(rows,'2026-10-17').some(r=>r.id==='a')).toBe(true)});
  it('summary counts arriving on selected date only among created',()=>{const s=newTodaySummary(rows,'2026-10-17');expect(s.created).toBe(3);expect(s.arriving).toBe(1)});
  it('badge uses now, independent of selected date',()=>{expect(todayCreatedCount(rows,new Date('2026-10-17T12:00:00Z'))).toBe(3);expect(todayCreatedCount(rows,new Date('2026-10-18T12:00:00Z'))).toBe(1)});
  it('winter time and dst boundary',()=>{expect(createdOn([b('w','2026-12-01T23:30:00Z')],'2026-12-02').length).toBe(1);expect(createdOn([b('s','2026-10-24T22:30:00Z')],'2026-10-25').length).toBe(1)});
  it('sorts by actual instants regardless of timestamp offset',()=>{expect(createdOn([b('early','2026-10-17T14:00:00+04:00'),b('late','2026-10-17T12:00:00Z')],'2026-10-17').map(r=>r.id)).toEqual(['late','early'])});
  it('ignores malformed stored timestamps without crashing',()=>{expect(createdOn([b('bad','not-a-date')],'2026-10-17')).toEqual([]);expect(newTodaySummary([b('badarrival','2026-10-17T10:00:00Z','invalid')],'2026-10-17').arriving).toBe(0)});
  it('discloses preserved original imported creation dates',()=>{expect(IMPORT_NOTE).toContain('ursprüngliches Datum');expect(IMPORT_NOTE).not.toContain('nicht das ursprüngliche')});
  it('date helpers',()=>{expect(shiftDate('2026-10-31',1)).toBe('2026-11-01');expect(shortDate('2026-10-17')).toBe('17.10.26')});
});
