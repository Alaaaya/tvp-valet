import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {callCounter,CallCounter,startMinuteTicker} from './call-counter';

const C='2026-10-17T15:21:00Z'; // 17:21 Berlin
const t=(s:string)=>Date.parse(s);
describe('callCounter',()=>{
  it('no call -> none',()=>{expect(callCounter({calledAt:null}).state).toBe('none');expect(r(<CallCounter calledAt={null}/>)).toBe('');});
  it('live minutes floor',()=>{
    const x=callCounter({calledAt:C,checkedOutAt:null,now:t(C)+12*60000+59000});
    expect(x.minutes).toBe(12);expect(x.text).toBe('Angerufen 17:21 · seit 12 Min');expect(x.title).toContain('17.10.2026');
  });
  it('negative clamps to 0',()=>{expect(callCounter({calledAt:C,now:t(C)-5*60000}).minutes).toBe(0);});
  it('freeze at checkout, undo unfreezes, recheckout new end',()=>{
    const now=t(C)+90*60000;
    const f=callCounter({calledAt:C,checkedOutAt:t(C)+7*60000,now});
    expect(f.state).toBe('frozen');expect(f.text).toBe('Angerufen 17:21 · Anruf→Übergabe 7 Min');
    expect(callCounter({calledAt:C,checkedOutAt:null,now}).minutes).toBe(90);
    expect(callCounter({calledAt:C,checkedOutAt:t(C)+20*60000,now}).minutes).toBe(20);
    expect(callCounter({calledAt:C,checkedOutAt:t(C)-1000,now}).minutes).toBe(0);
  });
  it('initial server timestamps after reload give same result',()=>{
    const a=callCounter({calledAt:C,checkedOutAt:'2026-10-17T15:40:00Z'});
    const b=callCounter({calledAt:C,checkedOutAt:'2026-10-17T15:40:00Z',now:t(C)+9e9});
    expect(a.text).toBe(b.text);expect(a.minutes).toBe(19);
  });
  it('across day keeps Berlin date',()=>{
    const x=callCounter({calledAt:'2026-10-17T21:59:00Z',now:t('2026-10-17T21:59:00Z')+3*3600000});
    expect(x.date).toBe('17.10.2026');expect(x.time).toBe('23:59');expect(x.minutes).toBe(180);
  });
  it('DST uses absolute time',()=>{
    // spring forward 2026-03-29 01:00Z; 00:30Z -> 01:30Z is 60 real min
    expect(callCounter({calledAt:'2026-03-29T00:30:00Z',now:t('2026-03-29T01:30:00Z')}).minutes).toBe(60);
    // autumn back 2026-10-25 01:00Z
    expect(callCounter({calledAt:'2026-10-25T00:30:00Z',now:t('2026-10-25T01:30:00Z')}).minutes).toBe(60);
  });
  it('invalid timestamps do not crash',()=>{
    expect(callCounter({calledAt:'kaputt'}).state).toBe('none');
    expect(callCounter({calledAt:C,checkedOutAt:'kaputt',now:t(C)+60000}).state).toBe('live');
    expect(()=>r(<CallCounter calledAt="x" checkedOutAt="y"/>)).not.toThrow();
  });
  it('component renders compact and full',()=>{
    const h=r(<CallCounter calledAt={C} now={t(C)+120000}/>);
    expect(h).toContain('Angerufen 17:21');expect(h).toContain('seit 2 Min');expect(h).toContain('17.10.2026');
    const c=r(<CallCounter compact calledAt={C} now={t(C)+300000}/>);
    expect(c).toContain('call-counter--compact');expect(c).toContain('seit 5 Min');expect(c).not.toContain('cc-date');
  });
});
describe('startMinuteTicker',()=>{
  it('ticks each minute, refreshes on visible, cleans up',()=>{
    vi.useFakeTimers();const u=vi.fn();const l:Record<string,Function>={};
    const doc={visibilityState:'visible',addEventListener:(e:string,f:Function)=>{l[e]=f},removeEventListener:(e:string)=>{delete l[e]}};
    const stop=startMinuteTicker(u,doc);
    vi.advanceTimersByTime(120000);expect(u).toHaveBeenCalledTimes(2);
    l.visibilitychange();expect(u).toHaveBeenCalledTimes(3);
    stop();vi.advanceTimersByTime(180000);expect(u).toHaveBeenCalledTimes(3);expect(l.visibilitychange).toBeUndefined();
    vi.useRealTimers();
  });
});
