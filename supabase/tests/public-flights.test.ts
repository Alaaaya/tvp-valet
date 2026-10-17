import {describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';import vm from 'node:vm';import {stripTypeScriptTypes} from 'node:module';
import {readDusDay,selectFlights,validateFlightRequest,validateFlightDateRange} from '../functions/_shared/flights';
function harness(allowed:unknown=true,error:unknown=null){
 let handler:(r:Request)=>Promise<Response>;
 const rpc=vi.fn().mockResolvedValue({data:allowed,error});
 const upstream=vi.fn().mockResolvedValue([]);
 const source=fs.readFileSync(new URL('../functions/dus-flights/index.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
 const code=stripTypeScriptTypes(source);
 vm.runInNewContext(code,{Deno:{serve:(fn:any)=>handler=fn,env:{get:(key:string)=>['TVP_FLIGHTS_PUBLIC_KEY','SUPABASE_ANON_KEY'].includes(key)?'anon-public':'https://example.test'}},createClient:()=>({rpc}),readDusDay:upstream,selectFlights,validateFlightRequest,validateFlightDateRange,fetch,Response,Date,Map,Set,JSON,Number,Error});
 const call=(body:unknown={date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date()),flightNumbers:['A30540']},extra:Record<string,string>={},method='POST')=>handler!(new Request('https://example.test',{method,headers:{apikey:'anon-public',Authorization:'Bearer anon-public',Origin:'https://alaaaya.github.io',...extra},...(method==='POST'?{body:JSON.stringify(body)}:{})}));
 return {call,rpc,upstream};
}
describe('public flight endpoint security',()=>{
 it('accepts anon without any user auth or customer lookup',async()=>{const h=harness();const r=await h.call();expect(r.status).toBe(200);expect(h.rpc).toHaveBeenCalledExactlyOnceWith('consume_dus_flight_budget');expect(h.upstream).toHaveBeenCalledTimes(1);expect(await r.json()).toMatchObject({flights:[],missing:['A3540']})});
 it('uses persistent shared budget even before upstream/cache',async()=>{const h=harness(false);const r=await h.call();expect(r.status).toBe(429);expect(r.headers.get('Retry-After')).toBe('60');expect(h.upstream).not.toHaveBeenCalled()});
 it('fails closed on missing/broken durable budget',async()=>{for(const [a,e] of [[null,null],[true,{message:'oops'}]]){const h=harness(a,e);expect((await h.call()).status).toBe(503);expect(h.upstream).not.toHaveBeenCalled()}});
 it('rejects user JWT, invalid key and foreign origin',async()=>{for(const extra of [{Authorization:'Bearer user-JWT'},{apikey:'wrong'},{Origin:'https://evil.test'}]){const h=harness();expect([401,403]).toContain((await h.call(undefined,extra)).status);expect(h.rpc).not.toHaveBeenCalled()}});
 it('restricts method, payload size, unknown fields, invalid dates and flights',async()=>{const h=harness();expect((await h.call(undefined,{},'GET')).status).toBe(405);expect((await h.call(undefined,{'content-length':'9000'})).status).toBe(413);for(const body of [{date:'2026-02-30',flightNumbers:['A3540']},{date:'2026-10-17',flightNumbers:['https://evil.test']},{date:'2026-10-17',flightNumbers:[],bookingId:'private'},[],{date:'2026-10-17',flightNumbers:[],direction:'both'}])expect((await h.call(body)).status).toBe(400);expect(h.upstream).not.toHaveBeenCalled()});
});
