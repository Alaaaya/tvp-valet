import {t as tr} from './i18n';
import jsQR from 'jsqr';

export const MAX_PHOTO_BYTES=15*1024*1024;
export const MAX_SIDE=1280;
export const MAX_PIXELS=64_000_000;

/** Cheap size/type check, run before any decode or preview URL is created. */
export function validateImageFile(file:Blob):void{
  if(file.size>MAX_PHOTO_BYTES)throw new Error(tr("Das Foto ist zu groß (max. 15 MB)."));
  if(file.size===0)throw new Error(tr("Das Foto ist leer."));
  if(!file.type||!file.type.startsWith('image/'))throw new Error(tr("Bitte ein Foto auswählen."));
}

export interface LoadedImage{source:CanvasImageSource;width:number;height:number;release():void}
/** createImageBitmap when available, else HTMLImageElement + object URL (older iOS). Rejects oversize pixel counts. */
export async function loadImageFile(file:Blob):Promise<LoadedImage>{
  validateImageFile(file);
  const guard=(w:number,h:number)=>{if(!w||!h)throw new Error(tr("Das Foto konnte nicht gelesen werden."));if(w*h>MAX_PIXELS)throw new Error(tr("Das Foto hat zu viele Pixel. Bitte mit niedrigerer Auflösung aufnehmen."))};
  if(typeof createImageBitmap==='function'){
    try{const b=await createImageBitmap(file,{imageOrientation:'from-image'} as never);if(b.width*b.height>MAX_PIXELS){b.close?.();guard(b.width,b.height)}guard(b.width,b.height);return{source:b,width:b.width,height:b.height,release:()=>b.close?.()}}
    catch(e){if(e instanceof Error&&/Pixel|Pixeln|Foto/.test(e.message))throw e;/* fall back to <img> */}
  }
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();img.decoding='async';
    await new Promise<void>((res,rej)=>{img.onload=()=>res();img.onerror=()=>rej(new Error(tr("Das Foto konnte nicht gelesen werden.")));img.src=url});
    guard(img.naturalWidth,img.naturalHeight);
    return{source:img,width:img.naturalWidth,height:img.naturalHeight,release:()=>{img.src='';URL.revokeObjectURL(url)}};
  }catch(e){URL.revokeObjectURL(url);throw e}
}

export interface QrDecoder{decode(src:CanvasImageSource|ImageData,w?:number,h?:number):Promise<string|null>;kind:'barcode-detector'|'jsqr'}
type BD={detect(s:ImageBitmapSource):Promise<{rawValue:string}[]>};

/** Decode an ImageData with jsQR (pure, runs in Node too). */
export function decodeImageDataQr(img:{data:Uint8ClampedArray;width:number;height:number}):string|null{
  const r=jsQR(img.data,img.width,img.height,{inversionAttempts:'attemptBoth'});
  return r&&r.data?r.data:null;
}

export function hasBarcodeDetector():boolean{
  const w=globalThis as unknown as {BarcodeDetector?:{new(o?:object):BD;getSupportedFormats?:()=>Promise<string[]>}};
  return typeof w.BarcodeDetector==='function';
}

let canvas:HTMLCanvasElement|null=null;
function scaled(src:CanvasImageSource,w:number,h:number):ImageData|null{
  if(!w||!h)return null;
  const k=Math.min(1,MAX_SIDE/Math.max(w,h));const cw=Math.max(1,Math.round(w*k)),ch=Math.max(1,Math.round(h*k));
  canvas=canvas||document.createElement('canvas');canvas.width=cw;canvas.height=ch;
  const c=canvas.getContext('2d',{willReadFrequently:true});if(!c)return null;
  c.drawImage(src,0,0,cw,ch);return c.getImageData(0,0,cw,ch);
}

/** Feature-detected: native BarcodeDetector (qr_code supported) first, jsQR otherwise or when native finds nothing. */
export async function createQrDecoder():Promise<QrDecoder>{
  let native:BD|null=null;
  if(hasBarcodeDetector()){
    try{
      const C=(globalThis as unknown as {BarcodeDetector:{new(o?:object):BD;getSupportedFormats?:()=>Promise<string[]>}}).BarcodeDetector;
      const f=C.getSupportedFormats?await C.getSupportedFormats():['qr_code'];
      if(f.includes('qr_code'))native=new C({formats:['qr_code']});
    }catch{native=null}
  }
  return{
    kind:native?'barcode-detector':'jsqr',
    async decode(src,w=0,h=0){
      if(typeof ImageData!=='undefined'&&src instanceof ImageData)return decodeImageDataQr(src);
      const s=src as CanvasImageSource;
      if(native){try{const r=await native.detect(s as ImageBitmapSource);if(r[0]?.rawValue)return r[0].rawValue}catch{/* fall through to jsQR */}}
      const img=scaled(s,w,h);return img?decodeImageDataQr(img):null;
    },
  };
}

/** Decode a photo file (size/type limited). Returns null when no QR is found. */
export async function decodeQrFromFile(file:Blob,dec?:QrDecoder):Promise<string|null>{
  const im=await loadImageFile(file);
  try{const d=dec||await createQrDecoder();return await d.decode(im.source,im.width,im.height)}finally{im.release()}
}
