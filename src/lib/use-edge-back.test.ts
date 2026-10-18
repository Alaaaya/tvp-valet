import { describe, it, expect } from 'vitest';
import * as mod from './use-edge-back';
import { registry } from './edge-back';
describe('use-edge-back', () => {
  it('exports hook and registry starts empty', () => {
    expect(typeof mod.useEdgeBack).toBe('function');
    expect(registry.size()).toBe(0);
  });
});
