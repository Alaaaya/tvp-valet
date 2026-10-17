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

describe('landed today and transient errors',()=>{
  it('prefers actual landing time of a completed flight today',()=>{
    expect(compactFlight({actual:'2026-10-17T10:00:37Z',scheduled:'2026-10-17T09:30:00Z',delayMinutes:21} as any,null)).toEqual({time:'2026-10-17T10:00:37Z',delay:21});
  });
  it('falls back to recorded time only when no live data',()=>{
    expect(compactFlight(undefined,'2026-10-17T09:00:00Z').time).toBe('2026-10-17T09:00:00Z');
  });
});
