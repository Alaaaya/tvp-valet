import {t as tr} from './i18n';
import React from 'react';
import {ReferenceIcon} from './reference-icon';


type Props={kind:'in'|'out';number?:string|null;time?:string;delay?:number;title?:string;ariaLabel?:string;hint?:string};

/** Departure (parking, green) shows only the flight number. Return (red) shows live/recorded time and hints. */
export function FlightHead({kind,number,time,delay=0,title,ariaLabel,hint}:Props){
  if(!number?.trim())return null;
  if(kind==='in')return <div className="fp-head"><ReferenceIcon name="plane" size={18}/><strong>{number||''}</strong></div>;
  return <div className="fp-head"><ReferenceIcon name="plane" size={18}/><strong><bdi>{number}</bdi></strong>{time&&<span className="fp-time" {...(title?{title,'aria-label':ariaLabel}:{})}>{time}{delay!==0&&<small>{delay>0?'+':'−'}{Math.abs(delay)}{tr("′")}</small>}</span>}{hint&&<small className="fp-hint" role="status">{hint}</small>}</div>;
}
