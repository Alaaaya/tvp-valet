import {useEffect,useLayoutEffect,useRef} from 'react';
import {startBuildUpdates,offlineShellAllowsBuildReplace} from './build-update';

// Conservative by design: even read-only booking details can contain payment,
// media and confirmation controls owned by nested components.
export function protectedUpdateUi(doc: Pick<Document,'querySelector'|'activeElement'>): boolean {
 if(doc.querySelector('form, [role="dialog"]:not([hidden]), [role="alertdialog"]:not([hidden]), .modal-backdrop, video, canvas, input[type="file"]'))return true;
 const active=doc.activeElement;
 return !!active&&(active.matches('input, textarea, select, [contenteditable="true"]')||!!active.closest('[contenteditable="true"]'));
}
export function useBuildUpdates(blocked:boolean){
 const blockedRef=useRef(blocked),coordinator=useRef<ReturnType<typeof startBuildUpdates>|null>(null);
 useLayoutEffect(()=>{blockedRef.current=blocked;coordinator.current?.flush()},[blocked]);
 useEffect(()=>{
  const updater=startBuildUpdates({isBlocked:()=>blockedRef.current||protectedUpdateUi(document),beforeReplace:()=>offlineShellAllowsBuildReplace()});
  coordinator.current=updater;
  // Child-owned payment/camera/dialog flows and focus changes also release a queue.
  // Observer runs after DOM removal, never before React commits a closing action.
  let releaseTimer:ReturnType<typeof setTimeout>|undefined;
  const release=()=>{if(releaseTimer!==undefined)clearTimeout(releaseTimer);releaseTimer=setTimeout(()=>{releaseTimer=undefined;updater.flush()},0)};
  const observer=new MutationObserver(release);
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','role','contenteditable']});
  document.addEventListener('focusout',release);
  document.addEventListener('focusin',release);
  return()=>{if(releaseTimer!==undefined)clearTimeout(releaseTimer);observer.disconnect();document.removeEventListener('focusout',release);document.removeEventListener('focusin',release);updater.dispose();coordinator.current=null};
 },[]);
}
