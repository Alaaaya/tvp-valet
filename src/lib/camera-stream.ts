/**
 * One shared camera MediaStream for the whole app session.
 *
 * iOS Home Screen web apps re-show "… wants to access your camera" whenever
 * getUserMedia() runs again after the previous tracks were stopped (and on every
 * cold launch – WebKit bugs 215884 / 327237). So the camera is requested once,
 * video-only (no microphone = no second prompt), and the same stream is handed
 * to every handover photo/video screen and the booking QR scanner. Closing a
 * camera screen only detaches it; the tracks keep running (disabled) and are
 * stopped after CAMERA_IDLE_MS without use or when the page is unloaded.
 */
export const CAMERA_IDLE_MS=5*60*1000;
export const CAMERA_CONSTRAINTS:MediaStreamConstraints={video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false};

let shared:MediaStream|null=null;
let pending:Promise<MediaStream>|null=null;
let users=0;
let idle:ReturnType<typeof setTimeout>|undefined;
let unloadHooked=false;

const isLive=(s:MediaStream|null):s is MediaStream=>!!s&&s.getVideoTracks().some(t=>t.readyState==='live');
const setEnabled=(s:MediaStream,on:boolean)=>s.getVideoTracks().forEach(t=>{t.enabled=on});

function hookUnload(){
  if(unloadHooked||typeof window==='undefined')return;unloadHooked=true;
  // Only a real unload (not bfcache / app switch) releases the camera immediately.
  window.addEventListener('pagehide',e=>{if(!(e as PageTransitionEvent).persisted)stopCameraNow()});
}

/** Returns the shared live camera stream, calling getUserMedia only when none is alive. */
export async function acquireCamera():Promise<MediaStream>{
  if(idle!==undefined){clearTimeout(idle);idle=undefined}
  users++;
  try{
    if(isLive(shared)){setEnabled(shared,true);return shared}
    shared=null;
    if(!pending){
      if(!navigator.mediaDevices?.getUserMedia)throw new DOMException('getUserMedia unsupported','NotSupportedError');
      pending=navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS).then(s=>{
        shared=s;hookUnload();
        s.getTracks().forEach(t=>t.addEventListener?.('ended',()=>{if(shared===s&&!isLive(s))shared=null}));
        return s;
      }).finally(()=>{pending=null});
    }
    const s=await pending;setEnabled(s,true);return s;
  }catch(e){users=Math.max(0,users-1);throw e}
}

/** A screen stops using the camera. The stream stays alive for reuse until idle. */
export function releaseCamera(){
  users=Math.max(0,users-1);
  if(users>0||!shared)return;
  const s=shared;
  for(const t of s.getVideoTracks()){
    // Don't leave the torch burning or a zoom applied for the next screen.
    try{const c=(t.getCapabilities?.()||{}) as {torch?:boolean;zoom?:{min:number}};const adv:Record<string,unknown>={};if(c.torch)adv.torch=false;if(c.zoom)adv.zoom=Math.max(c.zoom.min,1);if(Object.keys(adv).length)void t.applyConstraints({advanced:[adv as MediaTrackConstraintSet]}).catch(()=>{})}catch{/* ignore */}
  }
  setEnabled(s,false);
  if(idle!==undefined)clearTimeout(idle);
  idle=setTimeout(()=>{idle=undefined;if(users===0)stopCameraNow()},CAMERA_IDLE_MS);
}

/** Stops the hardware; the next acquire calls getUserMedia again. */
export function stopCameraNow(){
  if(idle!==undefined){clearTimeout(idle);idle=undefined}
  shared?.getTracks().forEach(t=>t.stop());shared=null;
}

/** Test helper. */
export function __resetCameraForTests(){stopCameraNow();pending=null;users=0;unloadHooked=false}
