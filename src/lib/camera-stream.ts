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

/** Returns the shared live camera stream, calling getUserMedia only when none is alive. */
export async function acquireCamera():Promise<MediaStream>{
  hookPageEvents();
  users++;
  try{
    if(isLive(shared)){setEnabled(shared,true);return shared}
    shared=null;
    if(!pending){
      if(!navigator.mediaDevices?.getUserMedia)throw new DOMException('getUserMedia unsupported','NotSupportedError');
      const p:Promise<MediaStream>=navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS).then(s=>{
        shared=s;
        s.getTracks().forEach(t=>t.addEventListener?.('ended',()=>{if(shared===s&&!isLive(s))shared=null}));
        return s;
      }).finally(()=>{if(pending===p)pending=null});
      pending=p;
    }
    const s=await pending;
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
export function __resetCameraForTests(){stopCameraNow();users=0}
