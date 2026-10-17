import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
vi.mock('./handover-undo',()=>({undoHandover:vi.fn(),canUndoHandover:(b:any,a:string)=>a==='out'?!!b.checked_out_at:!!b.checked_in_at&&!b.checked_out_at}));
import {UndoControls,undoRequestKey,undoCopy,trapTab} from './undo-controls';
const b:any={id:'b1',status:'confirmed',checked_in_at:'2026-10-17T08:00:00Z',checked_out_at:null};
describe('undo controls',()=>{
  it('key includes expected timestamp',()=>{
    expect(undoRequestKey(b,'in')).toBe('b1:in:2026-10-17T08:00:00Z');
    expect(undoRequestKey({...b,checked_in_at:'2026-10-17T09:00:00Z'},'in')).not.toBe(undoRequestKey(b,'in'));
  });
  it('copy is action specific',()=>{
    expect(undoCopy('out',b)).toMatch(/wieder als eingecheckt/);
    expect(undoCopy('in',b)).toMatch(/wieder als erwartet/);
    expect(undoCopy('in',b)).not.toMatch(/offen/);
  });
  it('tab trap wraps',()=>{
    expect(trapTab(1,2,false)).toBe(0);expect(trapTab(0,2,true)).toBe(1);expect(trapTab(-1,2,false)).toBe(0);expect(trapTab(0,0,false)).toBe(-1);
  });
  it('renders only the check-in button before checkout, only checkout after',()=>{
    expect(r(<UndoControls booking={b} onDone={()=>{}}/>)).toMatch(/Check-in rückgängig/);
    const h=r(<UndoControls booking={{...b,checked_out_at:'2026-10-18T08:00:00Z'}} onDone={()=>{}}/>);
    expect(h).toMatch(/Check-out rückgängig/);expect(h).not.toMatch(/Check-in rückgängig/);
  });
});
