import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
vi.mock('../api',()=>({supabaseUrl:'https://p.supabase.co',supabaseAnonKey:'anon-key',db:{auth:{getSession:()=>{throw Error('flights must not touch auth')}}}}));
import {fetchFlightUpdates} from './flights';
const data={flights:[],missing:['EW1'],source:'https://www.dus.com/en/flights/arrivals',updatedAt:'2026-10-17T09:00:00Z',cached:false};
const json=(b:unknown,status=200)=>new Response(JSON.stringify(b),{status});
let f:ReturnType<typeof vi.fn>;
beforeEach(()=>{f=vi.fn();vi.stubGlobal('fetch',f)});
afterEach(()=>vi.unstubAllGlobals());
describe('public flight client',()=>{
  it('posts with anon key only, no session token',async()=>{
    f.mockResolvedValue(json(data));
    expect(await fetchFlightUpdates(['EW 001'],'2026-10-17')).toEqual(data);
    const [url,init]=f.mock.calls[0];
    expect(url).toBe('https://p.supabase.co/functions/v1/dus-flights');
    expect(init.headers).toEqual({apikey:'anon-key',Authorization:'Bearer anon-key','Content-Type':'application/json'});
    expect(JSON.parse(init.body)).toEqual({flightNumbers:['EW1'],date:'2026-10-17',direction:'arrival'});
  });
  it('sends departure direction',async()=>{
    f.mockResolvedValue(json(data));await fetchFlightUpdates(['IB 1326'],'2026-10-24','departure');
    expect(JSON.parse(f.mock.calls[0][1].body)).toMatchObject({flightNumbers:['IB1326'],direction:'departure'});
  });
  it('surfaces server error message',async()=>{
    f.mockResolvedValue(json({error:'DUS-Livequelle momentan nicht erreichbar'},502));
    await expect(fetchFlightUpdates(['EW1'],'2026-10-17')).rejects.toThrow('DUS-Livequelle');
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('does not retry or refresh on 401',async()=>{
    f.mockResolvedValue(json({},401));
    await expect(fetchFlightUpdates(['EW1'],'2026-10-17')).rejects.toThrow('Flugzeiten');
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('maps network failure',async()=>{
    f.mockRejectedValue(new TypeError('offline'));
    await expect(fetchFlightUpdates(['EW1'],'2026-10-17')).rejects.toThrow('Flugzeiten');
  });
  it('rejects malformed success payload',async()=>{
    f.mockResolvedValue(json({flights:[]}));
    await expect(fetchFlightUpdates(['EW1'],'2026-10-17')).rejects.toThrow('Ungültige Antwort');
  });
  it('rejects invalid requests before fetching',async()=>{
    await expect(fetchFlightUpdates(['http://evil'],'2026-10-17')).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
});
