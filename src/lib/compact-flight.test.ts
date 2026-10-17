import {describe,it,expect} from 'vitest';
import {compactFlight} from './compact-flight';
const f=(o:object)=>o as never;
describe('compactFlight',()=>{
 it('prefers actual then estimated then scheduled',()=>{
  expect(compactFlight(f({actual:'A',estimated:'E',scheduled:'S'})).time).toBe('A');
  expect(compactFlight(f({estimated:'E',scheduled:'S'})).time).toBe('E');
  expect(compactFlight(f({scheduled:'S'})).time).toBe('S');
 });
 it('falls back to recorded then null',()=>{
  expect(compactFlight(undefined,'R').time).toBe('R');
  expect(compactFlight(undefined,null).time).toBeNull();
 });
 it('exposes delay',()=>{expect(compactFlight(f({scheduled:'S',delayMinutes:12})).delay).toBe(12)});
});
