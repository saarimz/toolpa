import { describe, expect, it } from 'vitest';
import { stalled } from './live.ts';

describe('live stall detection', () => {
  it('counts a running context whose clock barely moves', () => {
    expect(stalled('running', 0.4, 0.01)).toBe(true);
    expect(stalled('running', 0.4, 0.3)).toBe(false);
    expect(stalled('suspended', 0.4, 0)).toBe(false);
    expect(stalled('running', 0.1, 0)).toBe(false);
  });
});
