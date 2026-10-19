import React from 'react';
import {t as tr} from './i18n';
import {ComposedChart,Bar,Line,XAxis,YAxis,CartesianGrid,ResponsiveContainer,LabelList} from 'recharts';
export default function OccupancyChart({chartData,top,ticks}:{chartData:{date:string;label:string;arriving:number;departing:number;maximum:number;endOfDay:number}[];top:number;ticks:number[]}){return <ResponsiveContainer width="100%" height={300}><ComposedChart data={chartData} margin={{top:14,right:6,left:-14,bottom:0}} barGap={0}>
          <CartesianGrid stroke="#e4e8e6" vertical={false}/><XAxis dataKey="label" interval={6} tick={{fontSize:11,fill:'#6b7a76'}} tickLine={false}/><YAxis ticks={ticks} domain={[0,top]} tick={{fontSize:11,fill:'#6b7a76'}} tickLine={false} axisLine={false} width={44}/>
          <Bar dataKey="arriving" name={tr("Arriving")} fill="#259968" isAnimationActive={false}><LabelList dataKey="arriving" position="top" fontSize={8} fill="#259968" formatter={(v:unknown)=>Number(v)>0?String(v):''}/></Bar>
          <Bar dataKey="departing" name={tr("Departing")} fill="#e4433c" isAnimationActive={false}><LabelList dataKey="departing" position="top" fontSize={8} fill="#e4433c" formatter={(v:unknown)=>Number(v)>0?String(v):''}/></Bar>
          <Line dataKey="maximum" name={tr("Max occupancy")} stroke="#2f6fd0" strokeWidth={2} dot={false} isAnimationActive={false}/>
        </ComposedChart></ResponsiveContainer>}
