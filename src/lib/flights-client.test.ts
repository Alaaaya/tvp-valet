import {beforeEach,describe,it,expect,vi} from 'vitest';
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('../api',()=>({db:{functions:{invoke}}}));
import {fetchFlightUpdates} from './flights';
describe('flight client',()=>{
  beforeEach(()=>invoke.mockReset());
  it('invokes only the secure function with normalized input',async()=>{
    const data={flights:[],missing:['EW1'],source:'https://www.dus.com/en/flights/arrivals',updatedAt:'2026-10-17T09:00:00Z',cached:false};
    invoke.mockResolvedValue({data,error:null});
    expect(await fetchFlightUpdates(['EW 001'],'2026-10-17')).toEqual(data);
    expect(invoke).toHaveBeenCalledWith('dus-flights',{body:{flightNumbers:['EW1'],date:'2026-10-17'}});
  });
  it('surfaces explicit server failure rather than stale/made-up flight times',async()=>{
    invoke.mockResolvedValue({data:null,error:{context:new Response(JSON.stringify({error:'DUS-Livequelle momentan nicht erreichbar'}),{status:502})}});
    await expect(fetchFlightUpdates(['EW1'],'2026-10-17')).rejects.toThrow('DUS-Livequelle');
  });
  it('rejects malformed successful payload',async()=>{
    invoke.mockResolvedValue({data:{flights:[]},error:null});
    await expect(fetchFlightUpdates(['EW1'],'2026-10-17')).rejects.toThrow('Ungültige Antwort');
  });
  it('rejects invalid requests before invoking anything',async()=>{
    await expect(fetchFlightUpdates(['http://evil'],'2026-10-17')).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
});
