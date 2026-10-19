import {t as tr} from './i18n';
import React from 'react';


type Props={kind:'in'|'out';number?:string|null;time?:string;delay?:number;title?:string;ariaLabel?:string;hint?:string};

function FlightIcon(){return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" stroke="none" d="m21 3-1-1-7.5 5.5-7-2-1.7 1.7 5.7 3.4-4.3 4.3-3.1-.8L1 15.3l4.6 3.1L8.7 23l1.2-1.2-.8-3.1 4.3-4.3 3.4 5.7 1.7-1.7-2-7L22 4z"/></svg>}
/** Departure (parking, green) shows only the flight number. Return (red) shows live/recorded time and hints. */
export function FlightHead({kind,number,time,delay=0,title,ariaLabel,hint}:Props){
  if(!number?.trim())return null;
  if(kind==='in')return <div className="fp-head"><FlightIcon/><strong>{number||''}</strong></div>;
  return <div className="fp-head"><FlightIcon/><strong><bdi>{number}</bdi></strong>{time&&<span className="fp-time" {...(title?{title,'aria-label':ariaLabel}:{})}>{time}{delay!==0&&<small>{delay>0?'+':'−'}{Math.abs(delay)}{tr("′")}</small>}</span>}{hint&&<small className="fp-hint" role="status">{hint}</small>}</div>;
}
