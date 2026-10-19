import React from 'react';
import {faCar} from '@fortawesome/free-solid-svg-icons/faCar';
import {faRightToBracket} from '@fortawesome/free-solid-svg-icons/faRightToBracket';
import {faRightFromBracket} from '@fortawesome/free-solid-svg-icons/faRightFromBracket';
import {faPhone} from '@fortawesome/free-solid-svg-icons/faPhone';
import {faPlane} from '@fortawesome/free-solid-svg-icons/faPlane';
import {faCalculator} from '@fortawesome/free-solid-svg-icons/faCalculator';

// Font Awesome Free solid geometry. Icons CC BY 4.0, https://fontawesome.com/license/free.
const icons={car:faCar,checkin:faRightToBracket,checkout:faRightFromBracket,phone:faPhone,plane:faPlane,calculator:faCalculator};
export function ReferenceIcon({name,size=16}:{name:keyof typeof icons;size?:number}){
  const [width,height,,,paths]=icons[name].icon;
  return <svg className={'reference-icon reference-icon-'+name} viewBox={`0 0 ${width} ${height}`} width={size} height={size} fill="currentColor" stroke="none" aria-hidden="true">{(Array.isArray(paths)?paths:[paths]).map((d,i)=><path d={d} key={i}/>)}</svg>;
}
