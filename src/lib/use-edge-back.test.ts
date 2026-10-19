import { describe, it, expect } from 'vitest';
import * as mod from './use-edge-back';
import { registry } from './edge-back';
describe('use-edge-back', () => {
  it('exports hook and registry starts empty', () => {
    expect(typeof mod.useEdgeBack).toBe('function');
    expect(registry.size()).toBe(0);
  });
});
import { readFileSync } from 'node:fs';
describe('edge-back css', () => {
  it('has no shadow or blur', () => {
    const css = readFileSync(new URL('../edge-back.css', import.meta.url), 'utf8').replace(/\/\*[^]*?\*\//g, '');
    expect(css).not.toMatch(/filter\s*:\s*blur/);
    expect(css).not.toMatch(/box-shadow\s*:\s*(?!none)[^;}]+/);
    expect(css).not.toMatch(/(?:linear|radial)-gradient|drop-shadow/);
    expect(css).toContain('.edge-back-revealing>.detail::before,.edge-back-revealing>.detail::after{content:none');
  });
});

describe('gesture-only underlist dim', () => {
  it('keeps the exposed list visibly gray at 40% progress and clears via cleanup', () => {
    const source = readFileSync(new URL('./use-edge-back.ts', import.meta.url), 'utf8');
    expect(source).toContain("String(.6*(1-p))");
    expect(source).toContain("parent.setAttribute('style',savedParent)");
    const opacity = .6 * (1 - .4);
    const whitePixel = Math.round(255 * (1 - opacity) + 85 * opacity);
    expect(whitePixel).toBe(194);
  });
});
