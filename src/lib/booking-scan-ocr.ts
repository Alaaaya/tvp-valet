import {t as tr} from './i18n';
import {loadImageFile} from './booking-scan-qr';
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
    await wk.setParameters({tessedit_char_whitelist:"ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ0123456789- ",tessedit_pageseg_mode:'7',user_defined_dpi:'300'});
    return wk;
  })().catch(e=>{w=null;throw e}));
  const kill=()=>{const p=w;w=null;if(p)void p.then(x=>x.terminate()).catch(()=>undefined)};
  return{
    recognize(img,signal){
      if(disposed)return Promise.reject(new Error('abgebrochen'));
      const run=async():Promise<PlateOcrResult>=>{
        if(signal?.aborted||disposed)throw new Error('abgebrochen');
        const wk=await start();
        if(signal?.aborted||disposed)throw new Error('abgebrochen');
        // A surrounding plate frame/Euroband can make SINGLE_LINE segmentation
        // classify the whole picture as a non-text region. Retry sparse text only
        // when no usable candidate was found; never invent or substitute letters.
        // Reset for every job, including jobs following an aborted fallback.
        await wk.setParameters({tessedit_pageseg_mode:'7'});
        if(signal?.aborted||disposed)throw new Error('abgebrochen');
        let r=await wk.recognize(img);
        if(signal?.aborted||disposed)throw new Error('abgebrochen');
        let candidates=extractPlateCandidates(r.data.text||'');
        if(!candidates.length){
          await wk.setParameters({tessedit_pageseg_mode:'11'});
          if(signal?.aborted||disposed)throw new Error('abgebrochen');
          const sparse=await wk.recognize(img);
          if(signal?.aborted||disposed)throw new Error('abgebrochen');
          const found=extractPlateCandidates(sparse.data.text||'');
          if(found.length){r=sparse;candidates=found}
        }
        return{text:r.data.text||'',confidence:Math.round(r.data.confidence||0),candidates};
      };
      let onAbort=()=>{};
      /* abort terminates the worker so the CPU stops immediately; the next job spawns a fresh one */
      const aborted=new Promise<never>((_,rej)=>{onAbort=()=>{kill();rej(new Error('abgebrochen'))};if(signal)signal.addEventListener('abort',onAbort,{once:true})});
      aborted.catch(()=>undefined);
      const p=Promise.race([chain.then(run,run),aborted]).finally(()=>signal?.removeEventListener('abort',onAbort));
      chain=p.catch(()=>undefined);return p;
    },
    async dispose(){disposed=true;const p=w;w=null;if(p)try{await (await p).terminate()}catch{/* already gone */}},
  };
}

/** Downscale + grayscale + contrast stretch a photo for OCR. Browser only. */
export async function preparePlatePhoto(file:Blob):Promise<Blob>{
  const im=await loadImageFile(file);
  try{
    const k=Math.min(1,OCR_SIDE/Math.max(im.width,im.height));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*k));c.height=Math.max(1,Math.round(im.height*k));
    const g=c.getContext('2d');if(!g)throw new Error(tr("Bildverarbeitung nicht verfügbar."));
    g.drawImage(im.source,0,0,c.width,c.height);
    return await new Promise<Blob>((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error(tr("Bild konnte nicht verarbeitet werden."))),'image/png'));
  }finally{im.release()}
}
