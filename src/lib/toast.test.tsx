import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {Toast,TOAST_MS} from './toast';
describe('toast',()=>{
 it('renders nothing without toast, overlay otherwise',()=>{expect(r(<Toast toast={null} onHide={()=>{}}/>)).toBe('');expect(r(<Toast toast={{text:'Anruf gespeichert',n:1}} onHide={()=>{}}/>)).toContain('Anruf gespeichert')});
 it('2s, fixed overlay without layout shift',()=>{expect(TOAST_MS).toBe(2000);const c=readFileSync('src/toast.css','utf8');expect(c).toMatch(/\.toast\{position:fixed/);expect(c).not.toMatch(/blur|gradient/)});
 it('timer cleanup and repeat keyed by n in effect',()=>{const s=readFileSync('src/lib/toast.tsx','utf8');expect(s).toMatch(/clearTimeout\(id\)/);expect(s).toContain('toast?.n');});
});
