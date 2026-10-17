import {describe,expect,it} from 'vitest';
import {parseQrPayload,normalizePlate,platesMatch,extractPlateCandidates,isValidBookingCode} from './booking-scan-parse';
describe('parseQrPayload',()=>{
  it('accepts plain codes, strips #, uppercases',()=>{
    expect(parseQrPayload('AF-YA4TQSG')).toEqual({ok:true,code:'AF-YA4TQSG',source:'plain'});
    expect(parseQrPayload(' #bkybr ')).toMatchObject({ok:true,code:'BKYBR'});
  });
  it('extracts only the code from URL param or last path segment',()=>{
    expect(parseQrPayload('https://x.example/b?code=AF-1234&utm=evil')).toMatchObject({ok:true,code:'AF-1234',source:'url-param'});
    expect(parseQrPayload('https://x.example/booking/NMS5S')).toMatchObject({ok:true,code:'NMS5S',source:'url-path'});
  });
  it('rejects unknown text, markup, scripts and non-http schemes',()=>{
    for(const s of ['hello world','javascript:alert(1)','<script>alert(1)</script>','data:text/html,<b>x','ftp://x/ABC123','https://x.example/','https://x.example/?code=a b%3Cb','', 'AB','A'.repeat(41)]){
      const r=parseQrPayload(s);expect(r.ok,s).toBe(false);
    }
    const r=parseQrPayload('javascript:alert(1)');expect(r.ok===false&&r.reason).toContain('javascript');
  });
  it('can restrict hosts and never returns a URL',()=>{
    expect(parseQrPayload('https://evil.example/?code=ABC123',{expectedHosts:['travel.example']}).ok).toBe(false);
    const r=parseQrPayload('https://travel.example/?code=ABC123',{expectedHosts:['TRAVEL.example']});
    expect(r.ok&&r.code).toBe('ABC123');expect(JSON.stringify(r)).not.toContain('http');
  });
  it('multiple different codes are surfaced as alternatives, never silently one',()=>{
    const r=parseQrPayload('https://x.example/?code=AAA111&booking=BBB222&code=AAA111');
    expect(r).toMatchObject({ok:true,code:'AAA111',alternatives:['BBB222']});
    expect(parseQrPayload('https://x.example/?code=AAA111&id=aaa111')).toEqual({ok:true,code:'AAA111',source:'url-param'});
  });
  it('code validation',()=>{expect(isValidBookingCode('AF-YA4TQSG')).toBe(true);expect(isValidBookingCode('a/b')).toBe(false);expect(isValidBookingCode('-AB')).toBe(false)});
});
describe('plates',()=>{
  it('normalizes spaces hyphens case',()=>{
    expect(normalizePlate('d-ab 1234')).toBe('DAB1234');expect(normalizePlate(' xk 498 d ')).toBe('XK498D');
    expect(platesMatch('R862BX','r-862-bx')).toBe(true);expect(platesMatch('D AB 1234','D AB 1235')).toBe(false);expect(platesMatch('','')).toBe(false);
  });
  it('does not guess O/0 substitutions',()=>{expect(platesMatch('DAB1O34','DAB1034')).toBe(false)});
  it('extracts German and foreign candidates, preserving display text',()=>{
    const c=extractPlateCandidates('D\nD AB 1234\nTÜV 2027');
    expect(c[0]).toMatchObject({display:'D AB 1234',key:'DAB1234'});
    expect(extractPlateCandidates('XK498D')[0].key).toBe('XK498D');
    expect(extractPlateCandidates('hello world')).toEqual([]);
    expect(extractPlateCandidates('MH-XY 12E')[0].key).toBe('MHXY12E');
  });
});
