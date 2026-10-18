// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {NewFilterScreen} from './new-filter-view';
import {DEFAULT_FILTER} from './new-filter';
it('focuses, traps both Tab directions, handles Escape and restores focus',async()=>{
 const prior=document.createElement('button'),host=document.createElement('div');
 document.body.append(prior,host);prior.focus();
 const root=createRoot(host),close=vi.fn();
 try{
  await act(async()=>root.render(<NewFilterScreen filter={DEFAULT_FILTER} set={()=>{}} onClose={close} locations={[]}/>));
  const buttons=Array.from(host.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'));
  expect(document.activeElement).toBe(buttons[0]);
  await act(async()=>buttons[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true})));
  expect(document.activeElement).toBe(buttons.at(-1));
  await act(async()=>buttons.at(-1)!.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));
  expect(document.activeElement).toBe(buttons[0]);
  await act(async()=>buttons[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  expect(close).toHaveBeenCalledTimes(1);
 }finally{await act(async()=>root.unmount());expect(document.activeElement).toBe(prior);host.remove();prior.remove()}
});
