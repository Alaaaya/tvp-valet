// Reveal a live camera <video> only once iOS WebKit has settled its layout.
// iOS first reports the rotated sensor dims (e.g. 1920x1080) for a portrait stream and paints the
// frame "contain"-fitted in that unrotated box (small centred preview), then fires 'resize' with
// 1080x1920. So: never reveal on the first frame; reveal only when the dims match the device
// orientation and have stayed put for 2 more frames (or ~150ms), with a hard cap after 'playing'.
export const SETTLE_MS=150,REVEAL_CAP_MS=700,SETTLE_FRAMES=2;

/** Expect portrait frames when the viewport is portrait (the camera stream follows the device). */
export function viewportPortrait():boolean{
  if(typeof window==='undefined')return true;const w=window.innerWidth,h=window.innerHeight;return !w||!h||h>=w;
}
/** Dims are known and agree with the device orientation. */
export function dimsStable(vw:number,vh:number,portrait=viewportPortrait()):boolean{
  if(!vw||!vh)return false;return portrait?vh>=vw:vw>=vh;
}
/** Force WebKit to re-apply object-fit:cover to a MediaStream video. */
export function repaintFit(v:HTMLVideoElement){
  try{v.style.objectFit='fill';void v.offsetWidth;v.style.objectFit='cover'}catch{/* ignore */}
}

type Opts={fit?:()=>void;onShow:()=>void;isLive?:()=>boolean};
/** Watches a video element; calls onShow exactly once when the preview is safe to show.
 *  Returns a cleanup. Keeps re-fitting/repainting on every 'resize' (also after reveal). */
export function watchPreviewReveal(v:HTMLVideoElement,{fit,onShow,isLive}:Opts):()=>void{
  let done=false,dead=false,token=0,settleT=0,capT=0,raf=0;
  const live=()=>!dead&&(!isLive||isLive());
  const refit=()=>{try{fit?.()}catch{/* ignore */}repaintFit(v)};
  const show=()=>{if(done||!live())return;done=true;clearTimeout(settleT);clearTimeout(capT);refit();
    const go=()=>{if(!dead&&(!isLive||isLive()))onShow()};
    if(typeof requestAnimationFrame==='function')raf=requestAnimationFrame(go);else go()};
  const check=()=>{
    if(done||!live())return;
    const my=++token;clearTimeout(settleT);
    if(!dimsStable(v.videoWidth,v.videoHeight))return;
    const w=v.videoWidth,h=v.videoHeight;
    const confirm=()=>{if(my!==token||done)return;if(v.videoWidth===w&&v.videoHeight===h&&dimsStable(w,h))show();else check()};
    const rv=(v as any).requestVideoFrameCallback;
    if(typeof rv==='function'){
      let n=0;const step=()=>{if(my!==token||done)return;if(++n>=SETTLE_FRAMES)confirm();else{try{rv.call(v,step)}catch{settleT=window.setTimeout(confirm,SETTLE_MS)}}};
      try{rv.call(v,step)}catch{settleT=window.setTimeout(confirm,SETTLE_MS)}
      // Frames can stall (backgrounded/paused): the timer also confirms, a little later.
      settleT=window.setTimeout(confirm,SETTLE_MS*2);
    }else settleT=window.setTimeout(confirm,SETTLE_MS);
  };
  const onResize=()=>{refit();check()};
  const onMeta=()=>{refit();check()};
  const onPlaying=()=>{refit();check();if(!capT&&!done)capT=window.setTimeout(show,REVEAL_CAP_MS)};
  v.addEventListener('loadedmetadata',onMeta);v.addEventListener('loadeddata',onMeta);v.addEventListener('playing',onPlaying);v.addEventListener('resize',onResize);
  check();
  return()=>{dead=true;token++;clearTimeout(settleT);clearTimeout(capT);if(raf&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(raf);
    v.removeEventListener('loadedmetadata',onMeta);v.removeEventListener('loadeddata',onMeta);v.removeEventListener('playing',onPlaying);v.removeEventListener('resize',onResize)};
}

/** Cover-size for an element inside a stage; landscape dims on a portrait viewport are treated
 *  as swapped so the element is never sized landscape during iOS's transient phase. */
export function coverSize(W:number,H:number,vw:number,vh:number,portrait=viewportPortrait()):{w:number;h:number}|null{
  if(!W||!H||!vw||!vh)return null;
  if(portrait&&vw>vh)[vw,vh]=[vh,vw];
  const k=Math.max(W/vw,H/vh);return{w:Math.ceil(vw*k),h:Math.ceil(vh*k)};
}
