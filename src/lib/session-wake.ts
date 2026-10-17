type Listener = () => void;
export interface WakeDoc {
  visibilityState: string;
  addEventListener(type: string, fn: Listener): void;
  removeEventListener(type: string, fn: Listener): void;
}
export interface WakeWin {
  addEventListener(type: string, fn: Listener): void;
  removeEventListener(type: string, fn: Listener): void;
}

/** Recover the session on focus/visible/online, then call wake once settled. Returns cleanup. */
export function installSessionWake(
  doc: WakeDoc,
  win: WakeWin,
  recover: (() => Promise<unknown>) | null,
  wake: () => void,
): () => void {
  const onWake: Listener = () => {
    if (doc.visibilityState !== 'visible') return;
    if (!recover) { wake(); return; }
    Promise.resolve()
      .then(() => recover())
      .catch(() => {})
      .finally(wake);
  };
  doc.addEventListener('visibilitychange', onWake);
  win.addEventListener('focus', onWake);
  win.addEventListener('online', onWake);
  return () => {
    doc.removeEventListener('visibilitychange', onWake);
    win.removeEventListener('focus', onWake);
    win.removeEventListener('online', onWake);
  };
}
