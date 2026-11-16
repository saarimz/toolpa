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

    trace.event('ui.action', { n: 1, ok: true, note: null });
    trace.metric('decode.ms', 1.5, 'ms', { case: 'a' });

    expect(lines).toHaveLength(3);
    const records = lines.map((line) => JSON.parse(line.trim()));
    expect(records[0]).toEqual({
      kind: 'event',
      v: 1,
      seq: 1,
      t: '2026-01-15T12:00:00.000Z',
      name: 'trace.ready',
      level: 'info',
      fields: { sinks: 2 },
    });
    expect(records[1]).toMatchObject({ kind: 'event', seq: 2, name: 'ui.action', fields: { n: 1, ok: true, note: null } });
    expect(records[2]).toEqual({
      kind: 'metric',
      v: 1,
      seq: 3,
      t: '2026-01-15T12:00:00.000Z',
      name: 'decode.ms',
      value: 1.5,
      unit: 'ms',
      fields: { case: 'a' },
    });
    expect(records.map((record) => record.seq)).toEqual([1, 2, 3]);
    expect(ring.snapshot().map((record) => record.name ?? record.kind)).toEqual([
      'trace.ready',
      'ui.action',
      'decode.ms',
    ]);
  });

  it('keeps a bounded in-memory ring', () => {
    const ring = new MemoryRing(3);
    const { trace } = createTrace({ ring, now: fixedNow });
    trace.event('harness.canary', { n: 1 });
    trace.event('harness.canary', { n: 2 });
    trace.event('harness.canary', { n: 3 });
    expect(ring.snapshot().map((record) => (record.kind === 'event' ? record.fields.n : record.name))).toEqual([
      1, 2, 3,
    ]);
  });

  it('rejects non-primitive fields, non-finite metrics, and unknown names', () => {
    const { trace } = createTrace({ now: fixedNow });
    expect(() => trace.event('error', { nested: { no: true } as unknown as string })).toThrow(/string, number, boolean/);
    expect(() => trace.metric('decode.ms', Number.NaN, 'ms')).toThrow(/finite/);
    expect(() => trace.event('not.registered', {})).toThrow(/unknown trace event/);
  });

  it('records span duration and turns a failure into an error event', () => {
    const { trace, ring } = createTrace({ now: fixedNow });
    const span = trace.span('ir.validate', { nodeCount: 1 });
    span.end({ ok: true, errorCount: 0 });
    const failed = trace.span('engine.lower', { hash: 'abc' });
    failed.fail({ code: 'SLICE_UNSUPPORTED', message: 'voices are not in the slice' });
    const records = ring.snapshot();
    const ended = records.find((record) => record.kind === 'event' && record.fields.ok === true);
    expect(ended && ended.kind === 'event' ? Number(ended.fields.dur) : -1).toBeGreaterThanOrEqual(0);
    expect(records.some((record) => record.name === 'error' && record.kind === 'event' && record.fields.code === 'SLICE_UNSUPPORTED')).toBe(true);
  });
});
