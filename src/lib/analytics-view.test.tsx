import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
vi.mock('recharts',()=>{const P=(p:any)=>React.createElement('div',null,p.children);return{ComposedChart:P,Bar:P,Line:P,XAxis:P,YAxis:P,CartesianGrid:P,ResponsiveContainer:P,LabelList:P}});
import AnalyticsScreen,{DrawerSummary,peakText,dm,LIMIT_NOTE,chartMaximum,chartTicks} from './analytics-view';
const days=[{date:'2026-10-17',arriving:10,departing:35,maximum:205,endOfDay:179},{date:'2026-10-18',arriving:12,departing:36,maximum:183,endOfDay:155}];
const data={days,parkedNow:170,overdueNow:2};
describe('analytics view',()=>{
  it('does not clip high-turnover bars when peak occupancy is low',()=>{const d=[{date:'2026-10-17',arriving:12,departing:15,maximum:1,endOfDay:0}];expect(chartMaximum(d)).toBe(15);const h=r(<DrawerSummary data={{...data,days:d}} onOpen={()=>{}}/>);expect(h).not.toMatch(/y="-/);expect(chartTicks(1)).toEqual([0,1]);expect(chartMaximum([])).toBe(1)});
  it('formats',()=>{expect(peakText(days)).toBe('Max occupancy: 205 on 17-10-2026');expect(dm('2026-10-07')).toBe('7/10');expect(peakText([])).toMatch(/–/)});
  it('drawer card is a button with peak',()=>{const h=r(<DrawerSummary data={data} onOpen={()=>{}}/>);expect(h).toMatch(/<button/);expect(h).toMatch(/Max occupancy: 205 on 17-10-2026/)});
  it('screen shows limitation, overdue and now note',()=>{const h=r(<AnalyticsScreen data={data} onBack={()=>{}}/>);expect(h).toContain(LIMIT_NOTE);expect(h).toMatch(/2 Fahrzeug/);expect(h).toMatch(/Aktuell geparkt: <strong>170/);expect(h).toMatch(/Chart/)});
  it('no gradients or blur in css',()=>{const c=readFileSync('src/analytics.css','utf8');expect(c).not.toMatch(/gradient|backdrop-filter|blur/)});
});
