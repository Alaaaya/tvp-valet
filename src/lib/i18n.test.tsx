// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach,expect,it} from 'vitest';
import translations from './translations.json';
import {LanguageProvider,LanguageSetting,setLanguage,t,LANGUAGES,readLanguage} from './i18n';
afterEach(()=>{setLanguage('de');document.body.innerHTML=''});
it('every registered label has all three nonempty translations',()=>{
 for(const [key,values] of Object.entries(translations)){
  expect(values.length,key).toBe(3);
  for(const value of values)expect(value.trim().length,key).toBeGreaterThan(0);
 }
});
it('fallback is German even with blocked storage',()=>{
 expect(readLanguage({getItem:()=>{throw Error('blocked')}})).toBe('de');
 expect(readLanguage({getItem:()=> 'xx'})).toBe('de');
});
it('updates root language, direction, visible choice and persistence together',async()=>{
 const div=document.createElement('div');document.body.appendChild(div);const root=createRoot(div);
 await act(async()=>root.render(<LanguageProvider><LanguageSetting/></LanguageProvider>));
 for(const lang of LANGUAGES){
  await act(async()=>setLanguage(lang));
  expect(document.documentElement.lang).toBe(lang);
  expect(document.documentElement.dir).toBe(lang==='ar'?'rtl':'ltr');
  expect(div.querySelector('select')!.value).toBe(lang);
  expect(localStorage.getItem('tvp.language.v1')).toBe(lang);
  expect(t('Edit booking')).toBe(translations['Edit booking'][lang==='en'?0:lang==='de'?1:2]);
 }
 await act(async()=>root.unmount());
});
