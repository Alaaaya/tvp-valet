import {describe,it,expect} from 'vitest';
import {displayComment} from './comments';
// Exact imported ZK4RM shape, no customer identity fields.
const zk='Destination = Dubaï\nDestination = Dubaï\nParkingPro source 5b7c56bd-2cd8-43a5-8c59-d0d2999deb24\nFahrzeug: {"brand":null,"type":null,"color":null,"description":"Volswagen Polo"}\nStandort: P2 - Überdachte Stellplätze';
describe('import comment presentation',()=>{
 it('separates real ZK4RM notes from source UUID and vehicle JSON without mutation',()=>{const original=zk;expect(displayComment(zk)).toEqual({text:'Destination = Dubaï\nDestination = Dubaï',vehicle:'Volswagen Polo',location:'P2 - Überdachte Stellplätze',imported:true});expect(zk).toBe(original)});
 it('keeps ordinary comments and arbitrary JSON intact',()=>{for(const s of ['Call when landed','Customer says {hello}','{"message":"customer note"}'])expect(displayComment(s).text).toBe(s)});
 it('supports older appended provenance object',()=>{expect(displayComment('Call first\n{"source":"ParkingPro","vehicle":{"description":"Polo"}}')).toEqual({text:'Call first',vehicle:'Polo',location:'',imported:true})});
 it('supports all-JSON provenance and customer notes',()=>{expect(displayComment('{"sourceId":"uuid","notes":"Call first","car":{"brand":"VW"}}')).toEqual({text:'Call first',vehicle:'VW',location:'',imported:true})});
 it('handles pretty printed vehicle JSON',()=>{expect(displayComment('ParkingPro source uuid\nFahrzeug: {\n"description":"Polo"\n}\nStandort: P2').text).toBe('')});
 it('does not swallow malformed customer data',()=>{expect(displayComment('Fahrzeug: {not json}\nPlease call').text).toBe('Fahrzeug: {not json}\nPlease call')});
});
