// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({state:{ready:true,online:false,pending:0,syncing:false,events:[],error:'',storagePersistent:false,shell:'ready'},listeners:new Set<()=>void>()}));
vi.mock('./offline-client',()=>({offlineSnapshot:()=>mock.state,subscribeOffline:(f:()=>void)=>{mock.listeners.add(f);return()=>mock.listeners.delete(f)},discardOfflineFrom:vi.fn()}));
import {OfflineStatusBanner} from './offline-status';
import {LanguageProvider,setLanguage,Language} from './i18n';
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.stubEnv('VITE_DURABLE_OFFLINE_WRITES','false');Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});mock.state={ready:true,online:false,pending:0,syncing:false,events:[],error:'',storagePersistent:false,shell:'ready'};host=document.createElement('div');document.body.append(host);root=createRoot(host)});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();mock.listeners.clear()});
async function mount(lang:Language){await act(async()=>{setLanguage(lang);root.render(<LanguageProvider><header><OfflineStatusBanner/></header></LanguageProvider>)})}
async function online(value:boolean){await act(async()=>{mock.state={...mock.state,online:value};for(const fn of mock.listeners)fn()})}
describe.each(['de','en','ar'] as Language[])('offline indicator %s',lang=>{
 it('has no online DOM or spacing even with pending work',async()=>{mock.state={...mock.state,online:true,pending:2};await mount(lang);expect(host.querySelector('header')?.children).toHaveLength(0);expect(document.querySelector('.offline-status')).toBeNull()});
 it('shows only hollow icon offline, opens localized status, closes with Escape and restores focus',async()=>{await mount(lang);const button=host.querySelector('button')!;expect(button.getAttribute('aria-label')).toBe(lang==='de'?'Offline & Synchronisierung':lang==='en'?'Offline & sync':'دون اتصال والمزامنة');expect(button.querySelector('.offline-ring')).not.toBeNull();expect(button.querySelector('.offline-count')).toBeNull();button.focus();await act(async()=>button.click());const dialog=document.querySelector('[role="dialog"]')!;expect(dialog.textContent).toContain(lang==='de'?'Internetverbindung':lang==='en'?'internet connection':'اتصال بالإنترنت');expect(button.getAttribute('aria-expanded')).toBe('true');expect(dialog.contains(document.activeElement)).toBe(true);await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(document.querySelector('[role="dialog"]')).toBeNull();expect(document.activeElement).toBe(button)});
 it('shows pending badge and errors in tapped status, removes everything on reconnect',async()=>{mock.state={...mock.state,pending:2,error:'QuotaExceededError'};await mount(lang);expect(host.querySelector('.offline-count')?.textContent).toBe('2');await act(async()=>host.querySelector('button')!.click());expect(document.querySelector('[role="alert"]')?.textContent).toBe('QuotaExceededError');await online(true);expect(host.querySelector('button')).toBeNull();expect(document.querySelector('[role="dialog"]')).toBeNull();await online(false);expect(document.querySelector('[role="dialog"]')).toBeNull()});
});
