import {extractPlateCandidates,type PlateCandidate} from './booking-scan-parse';
import coreSimd from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import coreBasic from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import workerUrl from 'tesseract.js/dist/worker.min.js?url';

export const MAX_OCR_BYTES=15*1024*1024;
export const OCR_SIDE=1600;
export interface PlateOcrResult{text:string;confidence:number;candidates:PlateCandidate[]}
export interface OcrPaths{workerPath?:string;corePath?:string;langPath?:string;gzip?:boolean}
type Worker={recognize(i:unknown):Promise<{data:{text:string;confidence:number}}>;setParameters(p:Record<string,string>):Promise<unknown>;terminate():Promise<unknown>};

/** Bundled, same-origin assets (GitHub Pages friendly, base-path aware). No CDN, no upload. */
export function bundledPaths(core:string=coreSimd):OcrPaths{
  const base=(import.meta.env?.BASE_URL||'/').replace(/\/?$/,'/');
  return{workerPath:workerUrl,corePath:core,langPath:base+'ocr',gzip:true};
}

export interface PlateOcr{recognize(img:Blob|string|Uint8Array,signal?:AbortSignal):Promise<PlateOcrResult>;dispose():Promise<void>}

/** Lazily loads tesseract.js (separate chunk) and one worker. recognize() calls are serialised; abort/dispose reject pending ones. */
export function createPlateOcr(paths:OcrPaths=bundledPaths()):PlateOcr{
  let w:Promise<Worker>|null=null,disposed=false,chain:Promise<unknown>=Promise.resolve();
  const start=()=>w||(w=(async()=>{
    const {createWorker}=await import('tesseract.js');
    const make=(p:OcrPaths)=>createWorker('eng',1,{...p,cacheMethod:'none',workerBlobURL:false} as never) as unknown as Promise<Worker>;
    let wk:Worker;
    try{wk=await make(paths)}catch(e){if(paths.corePath!==coreSimd)throw e;wk=await make({...paths,corePath:coreBasic})}
    if(disposed){void wk.terminate();throw new Error('abgebrochen')}
    await wk.setParameters({tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ0123456789- ',tessedit_pageseg_mode:'7',user_defined_dpi:'300'});
    return wk;
  })().catch(e=>{w=null;throw e}));
  return{
    recognize(img,signal){
      if(disposed)return Promise.reject(new Error('abgebrochen'));
      const run=async():Promise<PlateOcrResult>=>{
        if(signal?.aborted||disposed)throw new Error('abgebrochen');
        const wk=await start();
        if(signal?.aborted||disposed)throw new Error('abgebrochen');
        const r=await wk.recognize(img);
        if(signal?.aborted||disposed)throw new Error('abgebrochen');
        const text=r.data.text||'';
        return{text,confidence:Math.round(r.data.confidence||0),candidates:extractPlateCandidates(text)};
      };
      const p=chain.then(run,run);chain=p.catch(()=>undefined);return p;
    },
    async dispose(){disposed=true;const p=w;w=null;if(p)try{await (await p).terminate()}catch{/* already gone */}},
  };
}

/** Downscale + grayscale + contrast stretch a photo for OCR. Browser only. */
export async function preparePlatePhoto(file:Blob):Promise<Blob>{
  if(file.size>MAX_OCR_BYTES)throw new Error('Das Foto ist zu groß (max. 15 MB).');
  if(file.type&&!file.type.startsWith('image/'))throw new Error('Bitte ein Foto auswählen.');
  let bmp:ImageBitmap|HTMLImageElement;
  try{
    if(typeof createImageBitmap!=='function')throw new Error('fallback');
    bmp=await createImageBitmap(file,{imageOrientation:'from-image'} as never);
  }catch{
    const url=URL.createObjectURL(file);
    try{bmp=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Foto konnte nicht gelesen werden.'));img.src=url})}
    finally{URL.revokeObjectURL(url)}
  }
  try{
    const k=Math.min(1,OCR_SIDE/Math.max(bmp.width,bmp.height));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bmp.width*k));c.height=Math.max(1,Math.round(bmp.height*k));
    const g=c.getContext('2d');if(!g)throw new Error('Bildverarbeitung nicht verfügbar.');
    g.drawImage(bmp,0,0,c.width,c.height);
    return await new Promise<Blob>((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('Bild konnte nicht verarbeitet werden.')),'image/png'));
  }finally{if('close' in bmp)bmp.close()}
}
