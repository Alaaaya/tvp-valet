import {describe,it,expect,vi} from 'vitest';
import {validateFlightRequest,validateFlightDateRange,makeDusUrl,mapDusFlight,readDusDay,selectFlights,berlinDate} from '../functions/_shared/flights';
const now='2026-10-17T10:00:00.000Z';
const arrival={flightNumber:'IB 1325',adFlag:'A',scheduledTime:'2026-10-24T22:20:00+02:00',estimatedTime:null,actualTime:null,status:null};
const departure={flightNumber:'IB 1326',adFlag:'D',scheduledTime:'2026-10-24T06:20:00+02:00',estimatedTime:null,actualTime:null,status:null};
describe('DUS direction and truthful future schedules',()=>{
 it('defaults arrival and strictly validates direction',()=>{
  expect(validateFlightRequest({date:'2026-10-24',flightNumbers:['IB1325']})).toMatchObject({direction:'arrival'});
  expect(validateFlightRequest({date:'2026-10-24',flightNumbers:['IB1326'],direction:'departure'})).toMatchObject({direction:'departure'});
  for(const direction of [null,'both','Departure',true,{}])expect(()=>validateFlightRequest({date:'2026-10-24',flightNumbers:[],direction})).toThrow('Flugrichtung');
 });
 it('accepts future up to 365 and past up to 7 calendar days only',()=>{
  for(const date of ['2026-10-10','2026-10-24','2027-10-17'])expect(()=>validateFlightDateRange(date,'2026-10-17')).not.toThrow();
  for(const date of ['2026-10-09','2027-10-18'])expect(()=>validateFlightDateRange(date,'2026-10-17')).toThrow();
  expect(berlinDate(new Date('2026-10-24T22:30:00Z'))).toBe('2026-10-25');
 });
 it('uses official departures source and arrival=false',()=>{
  expect(new URL(makeDusUrl('2026-10-24',0,'departure')).searchParams.get('arrival')).toBe('false');
  expect(mapDusFlight(departure,now,'departure')).toMatchObject({flightNumber:'IB1326',scheduled:'2026-10-24T04:20:00.000Z',source:'https://www.dus.com/en/flights/departures'});
  expect(mapDusFlight(departure,now)).toBeNull();
  expect(mapDusFlight(arrival,now,'departure')).toBeNull();
 });
 it('reports actual departures as departed never landed',()=>{
  expect(mapDusFlight({...departure,actualTime:'2026-10-24T06:42:11+02:00'},now,'departure')).toMatchObject({status:'departed',delayMinutes:22});
  expect(mapDusFlight({...departure,status:{publicStatus:{name:'departed'}}},now,'departure')?.status).toBe('departed');
  expect(mapDusFlight({...departure,actualTime:'2026-10-24T06:42:11+02:00',status:{code:'C'}},now,'departure')?.status).toBe('cancelled');
 });
 it('preserves old readDusDay signature and third direction scopes upstream and mapping',async()=>{
  const fetcher=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({data:{flights:[arrival,departure,{...departure,scheduledTime:'2026-10-25T06:25:00+01:00'}],more:false}})));
  expect(await readDusDay('2026-10-24',fetcher)).toHaveLength(1);
  const rows=await readDusDay('2026-10-24',fetcher,'departure');
  expect(rows.map(f=>f.flightNumber)).toEqual(['IB1326']);
  expect(new URL(fetcher.mock.calls[1][0]).searchParams.get('arrival')).toBe('false');
 });
 it('labels exact date-valid future plans schedule without fabricated operational fields',()=>{
  const row=mapDusFlight({...arrival,estimatedTime:'2026-10-24T22:40:00+02:00',actualTime:'2026-10-24T22:42:00+02:00'},now)!;
  const result=selectFlights([row],['IB1325','ZZ9999'],now,false,'arrival','2026-10-24','2026-10-17');
  expect(result).toMatchObject({availability:'schedule',missing:['ZZ9999'],note:'Flugplan bestätigt. Live ab Flugtag.'});
  expect(result.flights[0]).toMatchObject({scheduled:'2026-10-24T20:20:00.000Z',estimated:null,actual:null,delayMinutes:null,status:'scheduled',statusText:null,dataKind:'schedule'});
  expect(row.actual).not.toBeNull();
 });
 it('never invents schedule for absent future date or different flight number',()=>{
  const result=selectFlights([],['IB1325'],now,false,'arrival','2027-10-17','2026-10-17');
  expect(result).toMatchObject({flights:[],missing:['IB1325'],availability:'unavailable',note:'Live ab Flugtag. Kein bestätigter Flugplan verfügbar.'});
 });
 it('keeps live board facts and negative delays for current and past days',()=>{
  const row=mapDusFlight({...arrival,scheduledTime:'2026-10-17T22:20:00+02:00',actualTime:'2026-10-17T22:15:00+02:00'},now)!;
  expect(selectFlights([row],['IB1325'],now,false,'arrival','2026-10-17','2026-10-17')).toMatchObject({availability:'live',flights:[{actual:'2026-10-17T20:15:00.000Z',delayMinutes:-5,dataKind:'live'}]});
 });
});
