import {describe,it,expect} from 'vitest';
import {ringProgress} from './ring-progress';
describe('ringProgress',()=>{it('clamps and guards',()=>{expect(ringProgress(0,0)).toBe(0);expect(ringProgress(3,2)).toBe(1);expect(ringProgress(-1,4)).toBe(0);expect(ringProgress(1,4)).toBe(0.25);expect(ringProgress(NaN,4)).toBe(0);expect(ringProgress(1,Infinity)).toBe(0)})});
