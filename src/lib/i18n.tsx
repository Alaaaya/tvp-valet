import React,{createContext,useContext,useLayoutEffect,useSyncExternalStore} from 'react';
import translations from './translations.json';
export type Language='de'|'en'|'ar';
export const LANGUAGES=['de','en','ar'] as const;
export const LANGUAGE_KEY='tvp.language.v1';
export const validLanguage=(v:unknown):v is Language=>LANGUAGES.includes(v as Language);
export function readLanguage(storage?:Pick<Storage,'getItem'>):Language{try{const v=storage?.getItem(LANGUAGE_KEY);return validLanguage(v)?v:'de'}catch{return 'de'}}
function initialLanguage():Language{try{return typeof window==='undefined'?'de':readLanguage(window.localStorage)}catch{return 'de'}}
let language:Language=initialLanguage();
let explicit=false;try{explicit=typeof window!=='undefined'&&validLanguage(window.localStorage.getItem(LANGUAGE_KEY))}catch{}
const listeners=new Set<()=>void>();
export function setLanguage(v:Language){if(!validLanguage(v))return;language=v;explicit=true;try{window.localStorage.setItem(LANGUAGE_KEY,v)}catch{}for(const fn of listeners)fn()}
export function getLanguage(){return language}
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn)}};
export function useLanguage(){return useSyncExternalStore(subscribe,getLanguage,()=> 'de' as Language)}
export type TranslationKey=keyof typeof translations;
export function t(key:TranslationKey):string{if(typeof window==='undefined'&&!explicit)return key;const item=translations[key];if(!item)return key;return item[language==='en'?0:language==='de'?1:2]||item[1]||key}
const Context=createContext<Language>('de');
export function LanguageProvider({children}:{children:React.ReactNode}){const lang=useLanguage();useLayoutEffect(()=>{document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr'},[lang]);return <Context.Provider value={lang}>{children}</Context.Provider>}
export function useLocale(){useContext(Context);return useLanguage()}
export function LanguageSetting(){const lang=useLanguage();return <fieldset className="language-setting"><legend>{lang==='ar'?'اللغة':lang==='en'?'Language':'Sprache'}</legend><select aria-label={lang==='ar'?'اللغة':lang==='en'?'Language':'Sprache'} value={lang} onChange={e=>setLanguage(e.target.value as Language)}>{LANGUAGES.map(l=><option key={l} value={l} lang={l}>{l==='ar'?'العربية':l==='en'?'English':'Deutsch'}</option>)}</select></fieldset>}
