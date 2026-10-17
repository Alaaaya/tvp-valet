import {describe,it,expect,vi} from 'vitest';
import {normalizeFlightNumber,validateFlightRequest,berlinMidnight,makeDusUrl,mapDusFlight,readDusDay,selectFlights} from '../../supabase/functions/_shared/flights';
const time = '2026-10-17T09:30:00Z';
const raw = {flightNumber:'EW 09751', adFlag:'A', scheduledTime:'2026-10-17T10:45:00+02:00', estimatedTime:'2026-10-17T11:38:58+02:00',actualTime:null,status:null};
describe('DUS live adapter',()=>{
  it('normalizes spaces, leading zeroes, IATA digits and ICAO',()=>{
    expect([' ew 09751 ','XQ-01320','6E 12','EWG9751'].map(normalizeFlightNumber)).toEqual(['EW9751','XQ1320','6E12','EWG9751']);
    expect(()=>normalizeFlightNumber('https://evil.example')).toThrow();
  });
  it('rejects invalid dates, hostile inputs and oversized batches',()=>{
    for(const value of [{flightNumbers:['EW1'],date:'2026-02-30'},{flightNumbers:['EW1'],date:'2026-13-01'}, {flightNumbers:[2],date:'2026-10-17'},{flightNumbers:Array(101).fill('EW1'),date:'2026-10-17'}]) expect(()=>validateFlightRequest(value)).toThrow();
    expect(validateFlightRequest({flightNumbers:['EW 01','EW1'],date:'2026-10-17'}).flightNumbers).toEqual(['EW1']);
  });
  it('uses correct Berlin midnight on both DST transitions',()=>{
    expect(berlinMidnight('2026-03-29')).toBe('2026-03-28T23:00:00.000Z');
    expect(berlinMidnight('2026-03-30')).toBe('2026-03-29T22:00:00.000Z');
    expect(berlinMidnight('2026-10-25')).toBe('2026-10-24T22:00:00.000Z');
    expect(berlinMidnight('2026-10-26')).toBe('2026-10-25T23:00:00.000Z');
    expect(new URL(makeDusUrl('2026-10-25')).searchParams.get('flightEndTime')).toBe('2026-10-25T22:59:59.000Z');
  });
  it('does not invent actual time and computes estimated delay',()=>{
    const flight=mapDusFlight(raw,time)!;
    expect(flight.actual).toBeNull(); expect(flight.delayMinutes).toBe(54);expect(flight.status).toBe('delayed');
    expect(flight.estimated).toBe('2026-10-17T09:38:58.000Z');
  });
  it('prefers real actual over estimate, allows early arrivals, cancellation overrides actual',()=>{
    const landed={...raw,actualTime:'2026-10-17T10:32:07+02:00'};
    expect(mapDusFlight(landed,time)).toMatchObject({status:'landed',delayMinutes:-13});
    expect(mapDusFlight({...landed,status:{code:'C'}},time)?.status).toBe('cancelled');
    expect(mapDusFlight({...raw,status:{code:'+'}},time)?.status).toBe('approaching');
    expect(mapDusFlight({...raw,adFlag:'D'},time)).toBeNull();
    expect(mapDusFlight({...raw,scheduledTime:'not-a-date'},time)).toBeNull();
  });
  it('keeps absent timestamps null and explicitly lists missing flights',()=>{
    const f=mapDusFlight({...raw,estimatedTime:null},time)!;
    expect(f).toMatchObject({estimated:null,actual:null,delayMinutes:null,status:'scheduled'});
    expect(selectFlights([f],['EW9751','LH2'],time,true)).toMatchObject({flights:[f],missing:['LH2'],cached:true});
  });
  it('sends required DUS XHR header and filters unrelated dates',async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{flights:[raw,{...raw,scheduledTime:'2026-10-18T10:45:00+02:00'}],more:false}})));
    const results=await readDusDay('2026-10-17',fetcher);
    expect(results).toHaveLength(1);
    expect(fetcher.mock.calls[0][1].headers['X-Requested-With']).toBe('XMLHttpRequest');
  });
  it('fails explicitly for HTTP, malformed schema or incomplete pagination',async()=>{
    await expect(readDusDay('2026-10-17',vi.fn().mockResolvedValue(new Response('bad',{status:503})))).rejects.toThrow('503');
    for(const payload of [{data:{}},{hasError:true,data:{flights:[],more:false}},{data:{flights:[raw],more:true}}])
      await expect(readDusDay('2026-10-17',vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))))).rejects.toThrow();
  });
});
