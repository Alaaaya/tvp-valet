import {describe,it,expect} from 'vitest';
import {compactFlight} from './compact-flight';
describe('retention',()=>{it('landed flight keeps actual time',()=>{expect(compactFlight({actual:'2026-10-17T10:00:37Z',delayMinutes:21} as never,null).time).toBe('2026-10-17T10:00:37Z')})});
