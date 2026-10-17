import {clock} from '../model';
import type {FlightUpdate} from './flights';
export interface FlightMeta {at:string;missing:string[];err:string;availability?:'live'|'schedule'|'unavailable';note?:string}
export function flightDescription(f:FlightUpdate|undefined,m:FlightMeta|undefined,number:string,recorded:string|null|undefined,direction:'arrival'|'departure',date:string,today:string):string {
  const parts:string[]=[];
  if(f){
    if(f.scheduled)parts.push('planmäßig '+clock(f.scheduled));
    if(f.estimated)parts.push('erwartet '+clock(f.estimated));
    if(f.actual)parts.push((direction==='arrival'?'gelandet ':'gestartet ')+clock(f.actual));
    if(f.statusText)parts.push(f.statusText);
    if(f.delayMinutes)parts.push((f.delayMinutes>0?'+':'−')+Math.abs(f.delayMinutes)+' Min.');
    if(date>today&&!f.actual&&!f.estimated)parts.push('Live ab Flugtag');
    if(f.source)parts.push('Quelle DUS · Stand '+clock(f.updatedAt));
  }else if(!number)parts.push('Kein Flug');
  else if(m?.err)parts.push('Flugzeiten derzeit nicht verfügbar · '+m.err);
  else if(m?.note)parts.push(m.note);
  else if(date>today)parts.push('Live ab Flugtag · Flugplan wird geladen …');
  else if(m?.at)parts.push('Keine Flugplandaten für '+number);
  else parts.push('Flugzeiten werden geladen …');
  if(recorded)parts.push('erfasst '+clock(recorded));
  return parts.join(' · ');
}
