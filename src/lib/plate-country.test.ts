import {describe,it,expect} from 'vitest';
import {plateCountry} from './plate-country';
describe('plateCountry',()=>{
 it.each(['UN-JP 51','W-R-1706','BOR EJ 87','RE CE 7815','D-TV 240','MH-AA 1909','K-AB 123E'])('DE %s',p=>expect(plateCountry(p)).toBe('DE'));
 it.each(['H461TL','ND824G','KSN96J','12-BD-FG','H-461-TL'])('NL %s',p=>expect(plateCountry(p)).toBe('NL'));
 it.each(['','AA-TEST-BB',null,undefined,'ABC123456','12345','SV 2828 X Y','F-123-AB-CD'])('unknown %s',p=>expect(plateCountry(p as any)).toBe(null));
 it('conflicting patterns stay unknown',()=>{expect(plateCountry('KL-BD-12')).toBe(null)});
});
