import React,{useState} from 'react';
import {useLanguage} from './i18n';
export const THEME_KEY='tvp.theme.v1';
export type Theme='classic'|'nana';
export function readTheme(storage?:Pick<Storage,'getItem'>):Theme{
  try{return storage?.getItem(THEME_KEY)==='nana'?'nana':'classic'}catch{return 'classic'}
}
export function writeTheme(storage:Pick<Storage,'setItem'>|undefined,value:Theme){
  try{storage?.setItem(THEME_KEY,value)}catch{/* The preference still works in this session. */}
}
export function useTheme(){
  const [theme,setTheme]=useState<Theme>(()=>{try{return readTheme(window.localStorage)}catch{return 'classic'}});
  return [theme,(value:Theme)=>{setTheme(value);try{writeTheme(window.localStorage,value)}catch{}}] as const;
}
export function ThemeSetting({value,onChange}:{value:Theme;onChange:(value:Theme)=>void}){
  const lang=useLanguage();
  return <fieldset className="theme-setting" dir="ltr"><legend>{lang==='ar'?'التصميم':lang==='en'?'Design':'Design'}</legend>
    <div className="theme-options">{(['classic','nana'] as const).map(theme=><label key={theme}>
      <input type="radio" name="theme" value={theme} checked={value===theme} onChange={()=>onChange(theme)}/>
      <span className={'theme-swatch '+theme} aria-hidden="true"/>
      <span>{theme==='classic'?'Klassisch':"Na’na"}{theme==='nana'&&lang==='ar'?' · نعناع':''}</span>
    </label>)}</div>
  </fieldset>;
}
