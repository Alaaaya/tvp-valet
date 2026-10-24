/** Configure WebKit's inline playback policy before attaching the existing stream.
 * play() initiates metadata loading too: never wait for metadata before attachment/play.
 * Abort/timeout clean up listeners even when WebKit leaves the play promise pending.
 */
export function startCameraPreview(video:HTMLVideoElement,stream:MediaStream,signal:AbortSignal):Promise<void>{
  if(signal.aborted)return Promise.reject(new DOMException('Preview cancelled','AbortError'));
  video.playsInline=true;video.muted=true;video.defaultMuted=true;video.autoplay=true;
  for(const name of ['playsinline','webkit-playsinline','muted','autoplay'])video.setAttribute(name,'');
  return new Promise((resolve,reject)=>{
    let settled=false;
    const clean=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);video.removeEventListener('error',error)};
    const finish=(e?:unknown)=>{if(settled)return;settled=true;clean();if(e)reject(e);else resolve()};
    const abort=()=>finish(new DOMException('Preview cancelled','AbortError'));
    const error=()=>finish(new Error('Camera preview failed'));
    const timer=setTimeout(()=>finish(new Error('Camera preview timed out')),12000);
    signal.addEventListener('abort',abort,{once:true});video.addEventListener('error',error,{once:true});
    try{video.srcObject=stream;Promise.resolve(video.play()).then(()=>finish(),finish)}catch(e){finish(e)}
  });
}
