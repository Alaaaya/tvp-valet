/**
 * One shared camera MediaStream while a camera screen is open.
 *
 * Video-only (no microphone = no second prompt). Inside an open screen the same
 * stream serves Photo↔Video switching, zoom and torch without calling
 * getUserMedia again, and concurrent opens share a single request.
 * As soon as the last screen (handover camera or QR scanner) releases it, all
 * tracks are stopped so the hardware is freed and iOS removes the red camera
 * indicator. Tracks are also stopped when the page is hidden or unloaded.
 * (A keep-alive did not prevent the iOS permission prompt and kept the
 * "camera recording" pill visible, so there is none.)
 */
export const CAMERA_CONSTRAINTS:MediaStreamConstraints={video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false};

let shared:MediaStream|null=null;
let pending:Promise<MediaStream>|null=null;
let users=0;
let hooked=false;

const isLive=(s:MediaStream|null):s is MediaStream=>!!s&&s.getVideoTracks().some(t=>t.readyState==='live');
const setEnabled=(s:MediaStream,on:boolean)=>s.getVideoTracks().forEach(t=>{t.enabled=on});
const stopTracks=(s:MediaStream)=>s.getTracks().forEach(t=>{try{t.stop()}catch{/* ignore */}});

function hookPageEvents(){
  if(hooked||typeof window==='undefined')return;hooked=true;
  window.addEventListener('pagehide',()=>stopCameraNow());
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stopCameraNow()});
}

/**
 * Prewarm grace: a getUserMedia started straight from a button tap (before the camera screen has
 * mounted) is kept at most this long without a screen using it, then stopped, so a tap that never
 * leads to a preview cannot leave the camera (and the iOS indicator) on.
 */
export const PREWARM_GRACE_MS=4000;
let prewarmTimer:ReturnType<typeof setTimeout>|undefined;
const clearPrewarm=()=>{if(prewarmTimer!==undefined){clearTimeout(prewarmTimer);prewarmTimer=undefined}};

/** Starts (or joins) the single getUserMedia request. Nothing is awaited before getUserMedia. */
function request():Promise<MediaStream>{
  if(pending)return pending;
  if(!navigator.mediaDevices?.getUserMedia)return Promise.reject(new DOMException('getUserMedia unsupported','NotSupportedError'));
  const p:Promise<MediaStream>=navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS).then(s=>{
    if(users===0&&prewarmTimer===undefined){/* nobody wants it any more (closed / prewarm expired) */stopTracks(s);throw new DOMException('Camera released','AbortError')}
    shared=s;
    s.getTracks().forEach(t=>t.addEventListener?.('ended',()=>{if(shared===s&&!isLive(s))shared=null}));
    return s;
  }).finally(()=>{if(pending===p)pending=null});
  pending=p;return p;
}

/**
 * Call synchronously in the tap handler that opens a camera/QR screen: getUserMedia starts in the
 * same user gesture, in parallel with React mounting the screen and loading its chunk. The screen's
 * acquireCamera() then joins this request instead of starting its own after mount.
 */
export function prewarmCamera():void{
  try{
    hookPageEvents();
    if(!navigator.mediaDevices?.getUserMedia)return;
    clearPrewarm();
    prewarmTimer=setTimeout(()=>{prewarmTimer=undefined;if(users===0)stopCameraNow()},PREWARM_GRACE_MS);
    if(!isLive(shared))request().catch(()=>{/* the screen reports errors on its own acquire */});
  }catch{/* never break the tap */}
}

/** The tap did not lead to a preview (sheet closed, plate photo chosen): stop a prewarmed stream now. */
export function cancelPrewarm():void{
  clearPrewarm();
  if(users===0)stopCameraNow();
}

/** Returns the shared live camera stream, calling getUserMedia only when none is alive or pending. */
export async function acquireCamera():Promise<MediaStream>{
  hookPageEvents();
  users++;clearPrewarm();
  try{
    if(isLive(shared)){setEnabled(shared,true);return shared}
    shared=null;
    const s=await request();
    if(users===0){/* every screen closed while the request was in flight */stopTracks(s);if(shared===s)shared=null;throw new DOMException('Camera released','AbortError')}
    setEnabled(s,true);return s;
  }catch(e){users=Math.max(0,users-1);throw e}
}

/** A screen stops using the camera. The last release stops the hardware immediately. */
export function releaseCamera(){
  users=Math.max(0,users-1);
  if(users===0)stopCameraNow();
}

/** Stops the hardware now; the next acquire calls getUserMedia again. */
export function stopCameraNow(){
  const s=shared;shared=null;
  if(s)stopTracks(s);
}

/** Test helper. */
export function __resetCameraForTests(){clearPrewarm();stopCameraNow();users=0;pending=null}
