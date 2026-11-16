import { describe, expect, it } from 'vitest';
import { MemoryRing, createTrace } from './index.ts';

const fixedNow = () => new Date('2026-01-15T12:00:00.000Z');

describe('createTrace', () => {
  it('writes NDJSON events and metrics, including trace.ready', () => {
    const lines: string[] = [];
    const { trace, ring } = createTrace({
      ndjson: (line) => lines.push(line),
      now: fixedNow,
    });

    trace.event('demo.tick', { n: 1, ok: true, note: null });
    trace.metric('demo.value', 1.5, 'x', { case: 'a' });

    expect(lines).toHaveLength(3);
    const records = lines.map((line) => JSON.parse(line.trim()));
    expect(records[0]).toEqual({
      kind: 'event',
      t: '2026-01-15T12:00:00.000Z',
      name: 'trace.ready',
      level: 'info',
      fields: { sinks: 2 },
    });
    expect(records[1]).toMatchObject({ kind: 'event', name: 'demo.tick', fields: { n: 1, ok: true, note: null } });
    expect(records[2]).toEqual({
      kind: 'metric',
      t: '2026-01-15T12:00:00.000Z',
      name: 'demo.value',
      value: 1.5,
      unit: 'x',
      fields: { case: 'a' },
    });
    expect(ring.snapshot().map((record) => record.name ?? record.kind)).toEqual([
      'trace.ready',
      'demo.tick',
      'demo.value',
    ]);
  });

  it('keeps a bounded in-memory ring', () => {
    const ring = new MemoryRing(3);
    const { trace } = createTrace({ ring, now: fixedNow });
    trace.event('a', {});
    trace.event('b', {});
    trace.event('c', {});
    expect(ring.snapshot().map((record) => (record.kind === 'event' ? record.name : record.name))).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('rejects non-primitive fields and non-finite metrics', () => {
    const { trace } = createTrace({ now: fixedNow });
    expect(() => trace.event('bad', { nested: { no: true } as unknown as string })).toThrow(/string, number, boolean/);
    expect(() => trace.metric('bad', Number.NaN, 'ms')).toThrow(/finite/);
  });
});
