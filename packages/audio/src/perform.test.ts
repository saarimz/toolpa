import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import { PerformError, PerformanceSet, performanceSelfCheck, quantizeLaunch } from './perform.ts';

describe('performance set', () => {
  it('learns a macro and launches on the next bar', () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const set = new PerformanceSet(
      [
        { id: 'scene-a', name: 'Scene A' },
        { id: 'scene-b', name: 'Scene B' },
      ],
      trace,
    );
    expect(quantizeLaunch(1.2, 1)).toBe(2);
    expect(quantizeLaunch(2, 1)).toBe(2);
    set.select('scene-a');
    set.armLearn('cutoff');
    expect(set.controlChange(74)).toEqual({ cc: 74, param: 'cutoff' });
    expect(set.macro(74)).toBe('cutoff');
    expect(set.launch(1.2, 1)).toEqual({ scene: 'scene-a', at: 2 });
    expect(set.reportXrun(1, 0.012)).toBe(1);
    expect(() => quantizeLaunch(Number.NaN, 1)).toThrow(PerformError);
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toEqual(expect.arrayContaining(['performance.scene', 'performance.learn', 'performance.launch', 'performance.xrun']));
    expect(performanceSelfCheck()).toEqual({ at: 2, param: 'cutoff', scene: 'scene-a' });
  });
});