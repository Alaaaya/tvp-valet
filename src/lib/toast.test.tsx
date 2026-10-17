import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi,afterEach} from 'vitest';
import {Toast,TOAST_MS,createToastTimer} from './toast';
describe('toast',()=>{
 it('renders nothing without toast, overlay otherwise',()=>{expect(r(<Toast toast={null} onHide={()=>{}}/>)).toBe('');expect(r(<Toast toast={{text:'Anruf gespeichert',n:1}} onHide={()=>{}}/>)).toContain('Anruf gespeichert')});
 it('2s, fixed overlay without layout shift',()=>{expect(TOAST_MS).toBe(2000);const c=readFileSync('src/toast.css','utf8');expect(c).toMatch(/\.toast\{position:fixed/);expect(c).not.toMatch(/blur|gradient/)});
 afterEach(()=>{vi.useRealTimers()});
 it('hides after exactly 2s',()=>{vi.useFakeTimers();const h=vi.fn(),t=createToastTimer();t.schedule(h);vi.advanceTimersByTime(1999);expect(h).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(h).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0)});
 it('cleanup cancels pending hide',()=>{vi.useFakeTimers();const h=vi.fn(),t=createToastTimer(),off=t.schedule(h);off();expect(vi.getTimerCount()).toBe(0);vi.advanceTimersByTime(5000);expect(h).not.toHaveBeenCalled()});
 it('identical repeated notice restarts the countdown with one timer',()=>{vi.useFakeTimers();const h=vi.fn(),t=createToastTimer();t.schedule(h);vi.advanceTimersByTime(1500);t.schedule(h);expect(vi.getTimerCount()).toBe(1);vi.advanceTimersByTime(1500);expect(h).not.toHaveBeenCalled();vi.advanceTimersByTime(500);expect(h).toHaveBeenCalledTimes(1)});
 it('component effect uses the timer helper with n key',()=>{const s=readFileSync('src/lib/toast.tsx','utf8');expect(s).toContain('createToastTimer(ms)');expect(s).toContain('toast?.n')});
});
