import {t as tr} from './i18n';
/** Durable offline writes stay OFF until a build explicitly sets VITE_DURABLE_OFFLINE_WRITES=true
 * (after the matching backend is approved and applied). Read at call time so tests can stub it. */
export const durableOfflineEnabled=()=>import.meta.env.VITE_DURABLE_OFFLINE_WRITES==='true';
/** Flag AND the booking carries the server's sync_version field (schema present). */
export const durableBookingReady=(b?:{sync_version?:number}|null)=>durableOfflineEnabled()&&!!b&&Number.isSafeInteger(b.sync_version)&&(b.sync_version as number)>=0;
export const offlineWritesDisabledError=()=>new Error(tr('Offline-Änderungen sind deaktiviert. Bitte mit Internetverbindung speichern.'));
export const isOnline=()=>typeof navigator==='undefined'||navigator.onLine!==false;
/** Durable path only when ready; otherwise legacy online write, or a clear error offline. Never queues. */
export async function routeWrite<T>(booking:{sync_version?:number}|null|undefined,durable:()=>Promise<T>,legacy:()=>Promise<T>):Promise<T>{
 if(durableBookingReady(booking))return durable();
 if(!isOnline())throw offlineWritesDisabledError();
 return legacy();
}
