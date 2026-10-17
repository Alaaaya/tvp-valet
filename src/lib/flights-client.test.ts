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
    expect(invoke).toHaveBeenCalledWith('dus-flights',{body:{flightNumbers:['EW1'],date:'2026-10-17',direction:'arrival'},headers:{Authorization:'Bearer current-token'}});
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

describe('mobile session recovery',()=>{
 const data={flights:[],missing:[],updatedAt:'2026-10-17T09:00:00Z'};
 const unauthorized={data:null,error:{context:new Response('{}',{status:401})}};
 beforeEach(()=>{vi.resetAllMocks();getSession.mockResolvedValue({data:{session:{access_token:'old'}},error:null});refreshSession.mockResolvedValue({data:{session:{access_token:'new'}},error:null})});
 it('renews a nearly expired persisted session before the request',async()=>{
  getSession.mockResolvedValue({data:{session:{access_token:'old',expires_at:Math.floor(Date.now()/1000)+20}},error:null});
  invoke.mockResolvedValue({data,error:null});
  await fetchFlightUpdates(['EW1'],'2026-10-17');
  expect(refreshSession).toHaveBeenCalledTimes(1);
  expect(invoke.mock.calls[0][1].headers.Authorization).toBe('Bearer new');
 });
 it('shares one refresh for simultaneous arrival and departure requests',async()=>{
  let complete!:(v:unknown)=>void;
  refreshSession.mockImplementation(()=>new Promise(resolve=>{complete=resolve}));
  invoke.mockImplementation((_name,options)=>Promise.resolve(options.headers.Authorization==='Bearer old'?unauthorized:{data,error:null}));
  const a=fetchFlightUpdates(['EW1'],'2026-10-17');
  const b=fetchFlightUpdates(['EW2'],'2026-10-17','departure');
  await vi.waitFor(()=>expect(refreshSession).toHaveBeenCalledTimes(1));
  complete({data:{session:{access_token:'new'}},error:null});
  await expect(Promise.all([a,b])).resolves.toEqual([data,data]);
  expect(refreshSession).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenCalledTimes(4);
 });
 it('uses a token already renewed by another request instead of rotating again',async()=>{
  getSession.mockResolvedValueOnce({data:{session:{access_token:'old'}},error:null}).mockResolvedValue({data:{session:{access_token:'renewed-elsewhere'}},error:null});
  invoke.mockResolvedValueOnce(unauthorized).mockResolvedValueOnce({data,error:null});
  await fetchFlightUpdates(['EW1'],'2026-10-17');
  expect(refreshSession).not.toHaveBeenCalled();
  expect(invoke.mock.calls[1][1].headers.Authorization).toBe('Bearer renewed-elsewhere');
 });
 it('sends departure direction explicitly without misusing the arrival board',async()=>{
  invoke.mockResolvedValue({data,error:null});
  await fetchFlightUpdates(['IB 1326'],'2026-10-24','departure');
  expect(invoke.mock.calls[0][1].body).toMatchObject({flightNumbers:['IB1326'],date:'2026-10-24',direction:'departure'});
 });
});
