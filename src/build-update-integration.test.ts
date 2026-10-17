import {it,expect} from 'vitest';
import source from './main.tsx?raw';
import hook from './lib/use-build-updates.ts?raw';
it('starts safe update checks before auth returns and protects all app-owned operations',()=>{
 const at=source.indexOf('useBuildUpdates(!authReady');
 expect(at).toBeGreaterThan(0);
 expect(at).toBeLessThan(source.indexOf('if(!authReady&&!session'));
 const blockers=source.slice(at,source.indexOf(';',at));
 for(const state of ['!authReady','!session','busy','refreshBusy','opsBusy','callBusy','selected','flow','scanOpen','scanOut','pendingScanJump','filters','newFilterOpen','menu',"view==='admin'","view==='import'",'importText'])expect(blockers).toContain(state);
 // selected remains set throughout editing, payment, confirmation and media flows.
 expect(hook).toContain('useLayoutEffect');
 expect(hook).toContain('MutationObserver');
 expect(hook).toContain('observer.disconnect()');
 expect(hook).toContain('updater.dispose()');
 expect(hook).not.toContain('localStorage.clear');
});
