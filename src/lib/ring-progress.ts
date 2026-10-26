/** Display-only progress for counter rings: done/total clamped to 0..1, zero/invalid total gives 0. */
export function ringProgress(done:number,total:number):number{
  if(!Number.isFinite(done)||!Number.isFinite(total)||total<=0)return 0;
  return Math.min(1,Math.max(0,done/total));
}
