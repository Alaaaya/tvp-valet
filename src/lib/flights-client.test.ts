import {beforeEach,describe,it,expect,vi} from 'vitest';
const {invoke,getSession,refreshSession}=vi.hoisted(()=>({invoke:vi.fn(),getSession:vi.fn(),refreshSession:vi.fn()}));
vi.mock('../api',()=>({db:{functions:{invoke},auth:{getSession,refreshSession}}}));
import {fetchFlightUpdates} from './flights';
describe('flight client',()=>{
  beforeEach(()=>{vi.resetAllMocks();getSession.mockResolvedValue({data:{session:{access_token:'current-token'}},error:null});refreshSession.mockResolvedValue({data:{session:{access_token:'fresh-token'}},error:null})});
  it('invokes only the secure function with normalized input',async()=>{
    const data={flights:[],missing:['EW1'],source:'https://www.dus.com/en/flights/arrivals',updatedAt:'2026-10-17T09:00:00Z',cached:false};
    invoke.mockResolvedValue({data,error:null});
    expect(await fetchFlightUpdates(['EW 001'],'2026-10-17')).toEqual(data);
    expect(invoke).toHaveBeenCalledWith('dus-flights',{body:{flightNumbers:['EW1'],date:'2026-10-17'},headers:{Authorization:'Bearer current-token'}});
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

describe('flight authorization refresh isolation',()=>{
 beforeEach(()=>{vi.resetAllMocks();getSession.mockResolvedValue({data:{session:{access_token:'old'}},error:null});refreshSession.mockResolvedValue({data:{session:{access_token:'new'}},error:null})});
 const data={flights:[],missing:[],updatedAt:'2026-10-17T09:00:00Z'};
 const unauthorized={data:null,error:{context:new Response('{}',{status:401})}};
 it('takes current session token on each invocation, refreshes once after401',async()=>{
  invoke.mockResolvedValueOnce(unauthorized).mockResolvedValueOnce({data,error:null});
  await expect(fetchFlightUpdates(['EW1'],'2026-10-17')).resolves.toEqual(data);
  expect(refreshSession).toHaveBeenCalledTimes(1);expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke.mock.calls[0][1].headers.Authorization).toBe('Bearer old');expect(invoke.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
 });
 it('never loops on persistent401',async()=>{invoke.mockResolvedValue(unauthorized);await expect(fetchFlightUpdates(['EW1'],'2026-10-17')).rejects.toThrow();expect(invoke).toHaveBeenCalledTimes(2);expect(refreshSession).toHaveBeenCalledTimes(1)});
 it('does not refresh/retry502 upstream source error',async()=>{invoke.mockResolvedValue({data:null,error:{context:new Response('{}',{status:502})}});await expect(fetchFlightUpdates(['EW1'],'2026-10-17')).rejects.toThrow();expect(invoke).toHaveBeenCalledTimes(1);expect(refreshSession).not.toHaveBeenCalled()});
 it('stops before request with absent session',async()=>{getSession.mockResolvedValue({data:{session:null},error:null});await expect(fetchFlightUpdates(['EW1'],'2026-10-17')).rejects.toThrow('anmelden');expect(invoke).not.toHaveBeenCalled()});
 it('stops if refresh fails without replay',async()=>{invoke.mockResolvedValue(unauthorized);refreshSession.mockResolvedValue({data:{session:null},error:{message:'expired'}});await expect(fetchFlightUpdates(['EW1'],'2026-10-17')).rejects.toThrow('abgelaufen');expect(invoke).toHaveBeenCalledTimes(1)});
});
