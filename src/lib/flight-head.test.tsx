import React from 'react';
import {renderToStaticMarkup as r} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {FlightHead} from './flight-head';

describe('FlightHead',()=>{
  it('parking panel shows only the number even with live/recorded values',()=>{
    const h=r(<FlightHead kind="in" number="BY123" time="12:00" delay={21} title="Veraltet" hint="Live-Daten werden geladen…"/>);
    expect(h).toContain('BY123');
    expect(h).not.toMatch(/12:00|\+21|fp-time|fp-hint|Live|Veraltet|title=|role=/);
  });
  it('parking panel empty when number missing',()=>{
    const h=r(<FlightHead kind="in" number={null} hint="Keine Live-Daten für diesen Flug"/>);
    expect(h).not.toContain('Kein Flug');expect(h).not.toContain('Keine');expect(h).toBe('');
  });
  it('return keeps live time and delay',()=>{
    const h=r(<FlightHead kind="out" number="BY123" time="12:00" delay={21}/>);
    expect(h).toContain('12:00');expect(h).toContain('+21′');
  });
  it('return keeps loading, error and missing hints',()=>{
    expect(r(<FlightHead kind="out" number="BY1" hint="Live-Daten werden geladen…"/>)).toContain('Live-Daten werden geladen…');
    expect(r(<FlightHead kind="out" number="BY1" time="12:00" title="Veraltet" ariaLabel="x"/>)).toContain('title="Veraltet"');
    expect(r(<FlightHead kind="out" number={null}/>)).toBe('');
  });
});
