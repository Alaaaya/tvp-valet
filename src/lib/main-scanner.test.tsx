import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {MainScanner,readTrackCaps,frameToVideoRect} from './main-scanner';
const src=readFileSync(new URL('./main-scanner.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../main-scanner.css',import.meta.url),'utf8');
const main=readFileSync(new URL('../main.tsx',import.meta.url),'utf8');
describe('MainScanner',()=>{
  const h=r(<MainScanner onLookup={()=>{}} onPlate={()=>{}} onClose={()=>{}}/>);
  it('bottom sheet Scannen with QR code + License plate rows and close',()=>{expect(h).toContain('>Scannen<');expect(h).toContain('QR code');expect(h).toContain('License plate');expect(h).toContain('aria-label="Schließen"')});
  it('opaque, no blur, no navigation or eval',()=>{expect(css).not.toMatch(/blur|backdrop-filter/);expect(src).not.toMatch(/location\.|window\.open|eval\(|new Function|dangerouslySetInnerHTML|href=/)});
  it('only the main search camera icon opens it; plate result fills the search, never opens a booking',()=>{
    expect(main.match(/setScanOpen\(true\)/g)?.length).toBe(1);expect(main).toContain('onPlate={p=>{setScanOpen(false);setScanOut(null);setQuery(p)}}');
    expect(src).toMatch(/onPlate\(best\.display\)/);
  });
  it('QR auto-detects and only passes a validated booking code',()=>{expect(src).toContain("onLookup({kind:'qr',value:r.code})");expect(src).toContain('parseQrPayload(raw');});
  it('real capabilities only: torch and zoom disabled when unsupported',()=>{
    expect(readTrackCaps(undefined)).toEqual({torch:false,zoom:null});
    expect(readTrackCaps({getCapabilities:()=>({torch:true,zoom:{min:1,max:5,step:0.1}})} as any)).toEqual({torch:true,zoom:{min:1,max:5,step:0.1}});
    expect(readTrackCaps({getCapabilities:()=>({zoom:{min:1,max:1}})} as any).zoom).toBeNull();
    expect(src).toContain('disabled={!caps.torch}');expect(src).toContain('disabled={!z}');expect(src).not.toMatch(/[^a-z]scale\(|CSS zoom/);
  });
  it('releases camera, aborts OCR, disposes on unmount',()=>{expect(src).toContain('releaseCamera()');expect(src).toMatch(/ctl\.current\?\.abort\(\);void ocr\.current\?\.dispose\(\)/)});
  it('crop maps the frame into video pixels with object-fit cover',()=>{
    const c=frameToVideoRect({w:300,h:600},{x:50,y:275,w:200,h:50},{w:1920,h:1080},0);
    expect(c.h).toBeCloseTo(50/(600/1080),1);expect(c.w).toBeCloseTo(200/(600/1080),1);expect(c.x).toBeCloseTo((50+(1920*600/1080-300)/2)/(600/1080),1);
  });
  it('plate screen matches reference colors',()=>{expect(css).toContain('#111927');expect(css).toContain('#156c6c');expect(css).toContain('#127475');expect(css).toContain('border:2px dashed');expect(css).toContain('width:76px');});
});
