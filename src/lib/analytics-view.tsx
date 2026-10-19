import {t as tr} from './i18n';
import React,{useState} from 'react';
import {ComposedChart,Bar,Line,XAxis,YAxis,CartesianGrid,ResponsiveContainer,LabelList} from 'recharts';
import {ChevronLeft,ChevronRight} from 'lucide-react';

export type AnalyticsDay={date:string;arriving:number;departing:number;maximum:number;endOfDay:number};
export type AnalyticsData={days:AnalyticsDay[];parkedNow:number;overdueNow:number};
export const LIMIT_NOTE="Nur importierte Buchungen enthalten; zukünftige Auslastung möglicherweise unvollständig.";

/** Turnover can exceed peak occupancy, so all displayed series determine the axis. */
export function chartMaximum(days:AnalyticsDay[]):number{return Math.max(1,...days.flatMap(d=>[d.arriving,d.departing,d.maximum]))}
export function chartTicks(top:number):number[]{return [...new Set([0,1,2,3,4].map(i=>Math.round(top*i/4)))]}

export function peakDay(days:AnalyticsDay[]):AnalyticsDay|undefined{return days.reduce<AnalyticsDay|undefined>((a,b)=>!a||b.maximum>a.maximum?b:a,undefined)}
export function dm(date:string){const[,m,d]=date.split('-');return Number(d)+'/'+Number(m)}
export function dmy(date:string){return date.split('-').reverse().join('-')}
export function peakText(days:AnalyticsDay[]){const p=peakDay(days);return p?tr("Max occupancy: ")+p.maximum+' on '+dmy(p.date):tr("Max occupancy: –")}

export function DrawerSummary({data,onOpen}:{data:AnalyticsData;onOpen:()=>void}){
  const days=data.days.slice(0,30);const top=chartMaximum(days);
  return <button type="button" className="an-card-btn" onClick={onOpen} aria-label={peakText(days)+'. Analyse öffnen'}>
    <svg className="an-mini" viewBox="0 0 120 40" aria-hidden="true" preserveAspectRatio="none">
      {days.map((d,i)=>{const w=120/Math.max(days.length,1);return <g key={d.date}><rect x={i*w+.3} width={w*.38} y={40-d.arriving/top*40} height={d.arriving/top*40} fill="#259968"/><rect x={i*w+w*.45} width={w*.38} y={40-d.departing/top*40} height={d.departing/top*40} fill="#e4433c"/></g>})}
      <polyline fill="none" stroke="#2f6fd0" strokeWidth="1.5" points={days.map((d,i)=>(i+.5)*120/Math.max(days.length,1)+','+(40-d.maximum/top*38)).join(' ')}/>
    </svg>
    <span className="an-card-text">{peakText(days)}</span><ChevronRight size={18} aria-hidden="true"/>
  </button>
}

export default function AnalyticsScreen({data,onBack}:{data:AnalyticsData;onBack:()=>void}){
  const[mode,setMode]=useState<'chart'|'table'>('chart');
  const days=data.days;const top=chartMaximum(days);const ticks=chartTicks(top);
  const chartData=days.map(d=>({...d,label:dm(d.date)}));
  return <div className="an-screen"><header className="an-head"><button type="button" aria-label={tr("Zurück")} onClick={onBack}><ChevronLeft size={24}/></button><strong>{tr("Analytics")}</strong><span/></header>
    <div className="an-switch" role="tablist" aria-label={tr("Ansicht")}><button role="tab" aria-selected={mode==='chart'} className={mode==='chart'?'on':''} onClick={()=>setMode('chart')}>{tr("Chart")}</button><button role="tab" aria-selected={mode==='table'} className={mode==='table'?'on':''} onClick={()=>setMode('table')}>{tr("Table")}</button></div>
    <div className="an-body">
      {mode==='chart'?<section className="an-card"><p className="muted" role="note">{tr("2 aufbewahrte QA-Testbuchungen sind ausgeschlossen.")}</p><h2>{tr("Parking Occupancy Analytics - 30 Day Outlook")}</h2>
        <div className="an-legend"><span><i className="g"/>{tr("Arriving")}</span><span><i className="r"/>{tr("Departing")}</span><span><i className="b line"/>{tr("Max occupancy")}</span></div>
        <div className="an-chart" role="img" aria-label={tr("Auslastung 30 Tage. ")+peakText(days)}><ResponsiveContainer width="100%" height={300}><ComposedChart data={chartData} margin={{top:14,right:6,left:-14,bottom:0}} barGap={0}>
          <CartesianGrid stroke="#e4e8e6" vertical={false}/><XAxis dataKey="label" interval={6} tick={{fontSize:11,fill:'#6b7a76'}} tickLine={false}/><YAxis ticks={ticks} domain={[0,top]} tick={{fontSize:11,fill:'#6b7a76'}} tickLine={false} axisLine={false} width={44}/>
          <Bar dataKey="arriving" name="Arriving" fill="#259968" isAnimationActive={false}><LabelList dataKey="arriving" position="top" fontSize={8} fill="#259968" formatter={(v:unknown)=>Number(v)>0?String(v):''}/></Bar>
          <Bar dataKey="departing" name="Departing" fill="#e4433c" isAnimationActive={false}><LabelList dataKey="departing" position="top" fontSize={8} fill="#e4433c" formatter={(v:unknown)=>Number(v)>0?String(v):''}/></Bar>
          <Line dataKey="maximum" name="Max occupancy" stroke="#2f6fd0" strokeWidth={2} dot={false} isAnimationActive={false}/>
        </ComposedChart></ResponsiveContainer></div>
        <p className="an-peak">{peakText(days)}</p></section>
      :<section><p className="muted" role="note">{tr("2 aufbewahrte QA-Testbuchungen sind ausgeschlossen.")}</p><h2 className="an-title">{tr("Parking occupancy overview for the next 30 days")}</h2><div className="an-table-wrap"><table className="an-table"><thead><tr><th>{tr("Date")}</th><th className="g">{tr("Arriving")}</th><th className="r">{tr("Departing")}</th><th className="b">{tr("Max occupancy")}</th><th>{tr("End of day")}</th></tr></thead><tbody>{days.map(d=><tr key={d.date}><td>{dm(d.date)}</td><td>{d.arriving}</td><td>{d.departing}</td><td><strong>{d.maximum}</strong></td><td>{d.endOfDay}</td></tr>)}</tbody></table></div></section>}
      <div className="an-notes"><p className="an-now">{tr("Aktuell geparkt:")} <strong>{data.parkedNow}</strong>. Die Kurve ist eine Projektion aus importierten Buchungen.</p>
        {data.overdueNow>0&&<p>{data.overdueNow} {tr("Fahrzeug(e) mit unbekanntem Check-out sind überfällig und werden weiter als geparkt mitgezählt.")}</p>}
        <p>{tr(LIMIT_NOTE)}</p></div>
    </div></div>
}
