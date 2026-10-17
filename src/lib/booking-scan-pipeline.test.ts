import {describe,expect,it,afterAll} from 'vitest';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import QRCode from 'qrcode';
import {decodeImageDataQr,validateImageFile} from './booking-scan-qr';
import {parseQrPayload} from './booking-scan-parse';
import {createPlateOcr} from './booking-scan-ocr';

/** Render a real QR (qrcode lib) into RGBA with quiet zone, scale and optional box-filter downscale + noise. */
function render(text:string,scale=6,noise=0){
  const q=QRCode.create(text,{errorCorrectionLevel:'M'});const n=q.modules.size,quiet=4,W=(n+quiet*2)*scale;
  const d=new Uint8ClampedArray(W*W*4);let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let y=0;y<W;y++)for(let x=0;x<W;x++){
    const mx=Math.floor(x/scale)-quiet,my=Math.floor(y/scale)-quiet;
    const dark=mx>=0&&my>=0&&mx<n&&my<n&&q.modules.get(my,mx);
    let v=dark?20:235;v=Math.max(0,Math.min(255,v+(rnd()-.5)*noise));
    const i=(y*W+x)*4;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;
  }
  return{data:d,width:W,height:W};
}
describe('image validation before preview/decode',()=>{
  it('rejects oversize, empty and non-image files',()=>{
    expect(()=>validateImageFile(new Blob([new Uint8Array(15*1024*1024+1)],{type:'image/png'}))).toThrow('zu groß');
    expect(()=>validateImageFile(new Blob([],{type:'image/png'}))).toThrow('leer');
    expect(()=>validateImageFile(new Blob(['x'],{type:'text/html'}))).toThrow('Foto');
    expect(()=>validateImageFile(new Blob(['x']))).toThrow('Foto');
    expect(()=>validateImageFile(new Blob(['x'],{type:'image/jpeg'}))).not.toThrow();
  });
});
describe('QR pipeline (real generated QR -> jsQR -> parse)',()=>{
  it('decodes a plain booking code',()=>{
    const r=parseQrPayload(decodeImageDataQr(render('AF-YA4TQSG'))!);expect(r).toMatchObject({ok:true,code:'AF-YA4TQSG'});
  });
  it('decodes noisy small QR with link and extracts only the code',()=>{
    const raw=decodeImageDataQr(render('https://example.com/b?code=BKYBR&x=1',4,60));
    expect(raw).toBe('https://example.com/b?code=BKYBR&x=1');expect(parseQrPayload(raw!)).toMatchObject({ok:true,code:'BKYBR',source:'url-param'});
  });
  it('unknown QR text is decoded but rejected with a disclosure',()=>{
    const raw=decodeImageDataQr(render('WIFI:S:cafe;P:secret;;'))!;const r=parseQrPayload(raw);
    expect(r.ok).toBe(false);expect(r.ok===false&&r.reason).toContain('kein Buchungscode');
  });
  it('returns null when there is no QR',()=>{
    const d=new Uint8ClampedArray(200*200*4).fill(128);expect(decodeImageDataQr({data:d,width:200,height:200})).toBeNull();
  });
});
const fx=(n:string)=>new URL('./scan-fixtures/'+n,import.meta.url);
const langPath=fileURLToPath(new URL('../../node_modules/@tesseract.js-data/eng/4.0.0_best_int',import.meta.url));
describe('plate OCR (real tesseract.js, on-device, generated plate photos)',()=>{
  const ocr=createPlateOcr({langPath,gzip:true} as never);
  afterAll(()=>ocr.dispose());
  it('bundles the language data for same-origin use identical to the package',()=>{
    const pub=fileURLToPath(new URL('../../public/ocr/eng.traineddata.gz',import.meta.url));
    expect(existsSync(pub)).toBe(true);expect(readFileSync(pub).equals(readFileSync(langPath+'/eng.traineddata.gz'))).toBe(true);
  });
  it('reads a German plate photo',async()=>{
    const r=await ocr.recognize(readFileSync(fx('plate-de.png')));
    expect(r.candidates.map(c=>c.key)).toContain('DAB1234');expect(r.confidence).toBeGreaterThan(40);
  },120000);
  it('reads a foreign yellow plate',async()=>{
    const r=await ocr.recognize(readFileSync(fx('plate-nl.png')));
    expect(r.candidates.map(c=>c.key)).toContain('XK498D');
  },120000);
  it('finds no plate in an image without one',async()=>{
    const r=await ocr.recognize(readFileSync(fx('blank.png')));expect(r.candidates.filter(c=>c.score>=2)).toEqual([]);
  },120000);
  it('aborting an in-flight job terminates the worker and the next job still works',async()=>{
    const a=new AbortController();const t0=Date.now();
    const p=ocr.recognize(readFileSync(fx('plate-de.png')),a.signal);setTimeout(()=>a.abort(),2);
    await expect(p).rejects.toThrow('abgebrochen');expect(Date.now()-t0).toBeLessThan(500);
    const r=await ocr.recognize(readFileSync(fx('plate-de.png')));expect(r.candidates.map(c=>c.key)).toContain('DAB1234');
  },120000);
  it('rejects aborted jobs and after dispose',async()=>{
    const a=new AbortController();a.abort();await expect(ocr.recognize(readFileSync(fx('blank.png')),a.signal)).rejects.toThrow('abgebrochen');
    const o2=createPlateOcr({langPath,gzip:true} as never);await o2.dispose();await expect(o2.recognize(readFileSync(fx('blank.png')))).rejects.toThrow('abgebrochen');
  });
});
