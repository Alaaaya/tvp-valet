import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
vi.mock('./customer-calls',()=>({removeCustomerCall:vi.fn()}));
import {CallUndo,canRemoveCall,removeKey,isStale,callStamp} from './call-undo';
import translations from './translations.json';
const b:any={id:'b1',plate:'D-AB 1',customer_name:'Max',status:'confirmed',customer_called_at:'2026-10-20T08:15:00Z',checked_out_at:null,lifecycle_revision:3};
describe('call undo',()=>{
  it('only for existing valid timestamp and known booking',()=>{
    expect(canRemoveCall(b,true)).toBe(true);expect(canRemoveCall(b,false)).toBe(false);
    expect(canRemoveCall({...b,customer_called_at:null},true)).toBe(false);expect(canRemoveCall({...b,customer_called_at:'x'},true)).toBe(false);
    expect(canRemoveCall({...b,checked_out_at:'2026-10-20T10:00:00Z'},true)).toBe(false);
    expect(canRemoveCall({...b,checked_out_at:undefined},true)).toBe(false);
    expect(canRemoveCall({...b,status:'cancelled'},true)).toBe(false);
    expect(canRemoveCall({...b,lifecycle_revision:undefined},true)).toBe(false);
    expect(canRemoveCall({...b,lifecycle_revision:-1},true)).toBe(false);
    expect(canRemoveCall({...b,lifecycle_revision:1.5},true)).toBe(false);
  });
  it('renders small button, no dialog initially, nothing without call',()=>{
    const h=r(<CallUndo booking={b} known variant="row" onDone={()=>{}}/>);
    expect(h).toMatch(/call-undo-row/);expect(h).toMatch(/Anruf löschen/);expect(h).not.toMatch(/alertdialog/);
    expect(r(<CallUndo booking={{...b,checked_out_at:'2026-10-20T10:00:00Z'}} known variant="detail" onDone={()=>{}}/>)).toBe('');
    expect(r(<CallUndo booking={{...b,customer_called_at:null}} known variant="detail" onDone={()=>{}}/>)).toBe('');
    expect(r(<CallUndo booking={b} known variant="detail" onDone={()=>{}}/>)).toMatch(/call-undo-detail/);
  });
  it('request key tied to timestamp; stale detection',()=>{
    expect(removeKey(b)).not.toBe(removeKey({...b,customer_called_at:'2026-10-20T09:00:00Z'}));
    expect(removeKey(b)).not.toBe(removeKey({...b,lifecycle_revision:4}));expect(removeKey(b)).toBe(removeKey({...b}));
    expect(isStale({code:'PT409'})).toBe(true);expect(isStale(new Error('x'))).toBe(false);
    expect(callStamp('2026-10-20T08:15:00Z')).toMatch(/20\.10\.2026/);
  });
  it('strings translated EN DE AR',()=>{
    for(const k of ['Anruf löschen','Aufgezeichneter Anruf','Wird gelöscht …','Neu laden','Anruf gelöscht','Bitte erneut versuchen.','Nur der irrtümlich erfasste aktuelle Anruf wird entfernt. Der Verlauf bleibt erhalten.']){
      const v=(translations as any)[k];expect(v?.length).toBe(3);expect(v.every(Boolean)).toBe(true);
    }
  });
});
