/** Which handover a recorded customer call belongs to.
 * One audited customer_called_at column serves both directions: a call recorded before check-in is the
 * arrival (Anreise) call, a call at/after check-in is the return (Retour) call. List rows and the detail
 * page both use this so a call on one side never marks the other side as called. */
export type CallPhase='in'|'out';
export function callPhaseOf(calledAt:string|null|undefined,checkedInAt:string|null|undefined):CallPhase|null{
  if(!calledAt)return null;
  const c=Date.parse(calledAt);
  if(!Number.isFinite(c))return null;
  const ci=checkedInAt?Date.parse(checkedInAt):NaN;
  return Number.isFinite(ci)&&c>=ci?'out':'in';
}
/** The call time if it belongs to the given direction, else null. */
export function callFor(phase:CallPhase,calledAt:string|null|undefined,checkedInAt:string|null|undefined):string|null{
  return callPhaseOf(calledAt,checkedInAt)===phase?calledAt!:null;
}
/** Return side shows only "Hat angerufen" until the return call is recorded; afterwards the normal pick-up actions. */
export function returnNeedsCall(o:{returnCalledAt?:string|null;takenAwayAt?:string|null;retrievedAt?:string|null;checkedOutAt?:string|null}){
  return !o.returnCalledAt&&!o.takenAwayAt&&!o.retrievedAt&&!o.checkedOutAt;
}
