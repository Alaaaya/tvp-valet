import React from 'react';
import {Menu,Funnel,Search,Camera,Clock,ArrowUpRight,ArrowDownLeft,Plane,MessageSquare,Users} from 'lucide-react';
const icons={menu:Menu,filter:Funnel,search:Search,camera:Camera,clock:Clock,out:ArrowUpRight,in:ArrowDownLeft,flight:Plane,chat:MessageSquare,users:Users};
/** Native-stack Claude theme. Lucide paths remain package-owned and licensed. */
export function ClaudeGlyph({name,size=24,className=''}:{name:keyof typeof icons;size?:number;className?:string}){
 const Icon=icons[name];return <Icon size={size} className={className} strokeWidth={2.5} fill={name==='chat'||name==='flight'?'currentColor':'none'} aria-hidden="true"/>;
}
