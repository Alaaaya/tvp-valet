import {t as tr} from './i18n';
export const MAX_VIDEO_SECONDS=120,MAX_VIDEO_BYTES=45*1024*1024;
export function validateVideoSize(size:number){
  if(!Number.isFinite(size)||size<=0)throw Error(tr("Video ist leer oder ungültig."));
  if(size>MAX_VIDEO_BYTES)throw Error(tr("Video ist größer als 45 MB. Bitte eine kürzere Aufnahme wählen."));
}
export function validateVideoDuration(duration:number){
  if(!Number.isFinite(duration)||duration<=0)throw Error(tr("Videodauer konnte nicht geprüft werden. Bitte eine andere Aufnahme wählen."));
  if(duration>MAX_VIDEO_SECONDS)throw Error(tr("Video ist länger als 120 Sekunden. Bitte eine kürzere Aufnahme wählen."));
}
export async function validateFallbackVideo(blob:Blob):Promise<void>{
  validateVideoSize(blob.size);
  const video=document.createElement('video'),url=URL.createObjectURL(blob);
  try{
    await new Promise<void>((resolve,reject)=>{
      const finish=(error?:Error)=>{clearTimeout(timer);video.onloadedmetadata=null;video.onerror=null;error?reject(error):resolve()};
      const timer=setTimeout(()=>finish(Error(tr("Videodauer konnte nicht rechtzeitig geprüft werden. Bitte erneut versuchen."))),10000);
      video.onloadedmetadata=()=>{try{validateVideoDuration(video.duration);finish()}catch(e){finish(e instanceof Error?e:Error(String(e)))}};
      video.onerror=()=>finish(Error(tr("Video konnte nicht gelesen werden. Bitte eine andere Aufnahme wählen.")));
      try{video.preload='metadata';video.muted=true;video.playsInline=true;video.src=url;video.load()}catch(e){finish(e instanceof Error?e:Error(String(e)))}
    });
  }finally{
    video.onloadedmetadata=null;video.onerror=null;
    try{video.removeAttribute('src');video.load()}finally{URL.revokeObjectURL(url)}
  }
}
