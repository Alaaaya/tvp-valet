import {t as tr} from './i18n';
import React,{useEffect,useState} from 'react';
import './../call-counter.css';

export type Ts=string|number|Date|null|undefined;
export type CallCounterResult={state:'none'|'live'|'frozen';minutes:number;text:string;title:string;time:string;date:string};

const tz='Europe/Berlin';
const fmtTime=new Intl.DateTimeFormat('de-DE',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false});
const fmtDate=new Intl.DateTimeFormat('de-DE',{timeZone:tz,day:'2-digit',month:'2-digit',year:'numeric'});

export function toEpoch(v:Ts):number|null{
  if(v===null||v===undefined||v==='')return null;
  const n=v instanceof Date?v.getTime():typeof v==='number'?v:Date.parse(v);
  return Number.isFinite(n)?n:null;
}

const NONE:CallCounterResult={state:'none',minutes:0,text:'',title:'',time:'',date:''};

export function callCounter({calledAt,checkedOutAt,now}:{calledAt:Ts;checkedOutAt?:Ts;now?:number}):CallCounterResult{
  const c=toEpoch(calledAt);
  if(c===null)return NONE;
  const out=toEpoch(checkedOutAt);
  const frozen=out!==null;
  const end=frozen?out:(now!==undefined&&Number.isFinite(now)?now:Date.now());
  const minutes=Math.max(0,Math.floor((end-c)/60000));
  const time=fmtTime.format(c),date=fmtDate.format(c);
  const text=frozen?`Angerufen ${time} · Anruf→Übergabe ${minutes} Min`:`Angerufen ${time} · seit ${minutes} Min`;
  return {state:frozen?'frozen':'live',minutes,text,time,date,title:`Kunde angerufen am ${date} um ${time} Uhr (Berlin)`};
}

/** minute ticker, exported so lifecycle is testable without a DOM */
export function startMinuteTicker(update:()=>void,doc?:{addEventListener:Function;removeEventListener:Function;visibilityState?:string},setI:typeof setInterval=setInterval,clearI:typeof clearInterval=clearInterval){
  const id=setI(update,60000);
  const vis=()=>{if(!doc||doc.visibilityState!=='hidden')update();};
  doc?.addEventListener('visibilitychange',vis);
  return ()=>{clearI(id);doc?.removeEventListener('visibilitychange',vis);};
}

export function CallCounter({calledAt,checkedInAt,checkedOutAt,compact,now}:{calledAt:Ts;checkedInAt?:Ts;checkedOutAt?:Ts;compact?:boolean;now?:number}){
  const [tick,setTick]=useState(()=>now??Date.now());
  // Current authoritative handover stamps control display, never call history.
  const handedOver=toEpoch(checkedInAt)!==null||toEpoch(checkedOutAt)!==null;
  const live=now===undefined&&toEpoch(calledAt)!==null&&!handedOver;
  useEffect(()=>{
    if(!live)return;
    setTick(Date.now());
    return startMinuteTicker(()=>setTick(Date.now()),typeof document!=='undefined'?document:undefined);
  },[live]);
  const r=callCounter({calledAt,checkedOutAt,now:now??tick});
  if(handedOver||r.state==='none')return null;
  const cls='call-counter'+(compact?' call-counter--compact':'')+(r.state==='frozen'?' is-frozen':'');
  return <div className={cls} title={r.title} data-state={r.state}>
    <span className="cc-main">{tr("Angerufen")}{' '}{r.time}</span>
    <span className="cc-dur">{r.state==='frozen'?`${tr('Anruf→Übergabe')} ${r.minutes} ${tr('Min')}`:`${tr('seit')} ${r.minutes} ${tr('Min')}`}</span>
    {compact?null:<span className="cc-date">{r.date}</span>}
  </div>;
}
