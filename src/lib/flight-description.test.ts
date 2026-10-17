import {describe,it,expect} from 'vitest';
import {flightDescription} from './flight-description';
import type {FlightUpdate} from './flights';
const future='2026-10-24',today='2026-10-17';
const f:FlightUpdate={flightNumber:'IB1325',scheduled:'2026-10-24T13:10:00Z',estimated:null,actual:null,status:'scheduled',statusText:null,delayMinutes:null,source:'https://www.dus.com/en/flights/arrivals',updatedAt:'2026-10-17T10:00:00Z'};
describe('truthful neutral flight detail',()=>{
 it('does not present future scheduled time as live',()=>{
  expect(flightDescription(f,undefined,'IB1325',null,'arrival',future,today)).toContain('Live ab Flugtag');
  expect(flightDescription(f,undefined,'IB1325',null,'arrival',future,today)).toContain('planmäßig 15:10');
  expect(flightDescription(f,undefined,'IB1325',null,'arrival',future,today)).not.toContain('gelandet');
 });
 it('shows a neutral future missing schedule note without an error',()=>{
  const text=flightDescription(undefined,{at:'2026-10-17T10:00:00Z',missing:['IB1325'],err:'',note:'Live ab Flugtag · Keine bestätigte Flugplanzeit verfügbar'},'IB1325',null,'arrival',future,today);
  expect(text).toContain('Live ab Flugtag');expect(text).not.toContain('Fehler');expect(text).not.toContain('geladen');
 });
 it('labels actual departure as started rather than landed',()=>{
  const text=flightDescription({...f,actual:'2026-10-24T13:15:00Z'},undefined,'IB1326',null,'departure',future,today);
  expect(text).toContain('gestartet 15:15');expect(text).not.toContain('gelandet');
 });
 it('keeps manually recorded time separate from the source',()=>{
  expect(flightDescription(f,undefined,'IB1325','2026-10-24T14:00:00Z','arrival',future,today)).toContain('erfasst 16:00');
 });
});
