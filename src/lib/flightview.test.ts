import {describe,it,expect} from 'vitest';
import {nextDay,delayText} from './flightview';
import {berlinMidnight} from '../../supabase/functions/_shared/flights';
describe('flightview',()=>{
 it('nextDay crosses month/year',()=>{expect(nextDay('2026-12-31')).toBe('2027-01-01');expect(nextDay('2026-02-28')).toBe('2026-03-01')});
 it('DST day is 25h in autumn, 23h in spring',()=>{const h=(a:string)=>(Date.parse(berlinMidnight(nextDay(a)))-Date.parse(berlinMidnight(a)))/36e5;expect(h('2026-10-25')).toBe(25);expect(h('2026-03-29')).toBe(23);expect(h('2026-10-17')).toBe(24)});
 it('delay sign',()=>{expect(delayText(12)).toBe('+12′');expect(delayText(-5)).toBe('−5′');expect(delayText(0)).toBe('');expect(delayText(null)).toBe('')});
});
