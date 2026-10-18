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
    expect(css).not.toMatch(/box-shadow\s*:\s*[^n]|blur|backdrop/);
  });
});
