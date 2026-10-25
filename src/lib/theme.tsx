import React,{useState} from 'react';
import {useLanguage} from './i18n';
export const THEME_KEY='tvp.theme.v1';
export type Theme='classic'|'nana'|'zaitoun'|'layl'|'safa'|'echt'|'azraq';
export function readTheme(storage?:Pick<Storage,'getItem'>):Theme{
  try{const value=storage?.getItem(THEME_KEY);return value==='nana'||value==='zaitoun'||value==='layl'||value==='safa'||value==='echt'||value==='azraq'?value:'classic'}catch{return 'classic'}
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
    <div className="theme-options">{(['classic','nana','zaitoun','layl','safa','echt','azraq'] as const).map(theme=><label key={theme}>
      <input type="radio" name="theme" value={theme} checked={value===theme} onChange={()=>onChange(theme)}/>
      <span className={'theme-swatch '+theme} aria-hidden="true"/>
      <span>{theme==='classic'?'Klassisch':theme==='nana'?"Na’na":theme==='zaitoun'?'Zaitoun':theme==='layl'?'Layl':theme==='safa'?'Safa':theme==='azraq'?'Azraq':'Klassisch Echt'}{lang==='ar'?(theme==='nana'?' · نعناع':theme==='zaitoun'?' · زيتون':theme==='layl'?' · ليل':theme==='safa'?' · صفاء':theme==='azraq'?' · أزرق':' · كلاسيك حقيقي'):''}</span>
    </label>)}</div>
  </fieldset>;
}
