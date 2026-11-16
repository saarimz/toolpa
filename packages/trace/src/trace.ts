import { assertTraceName } from './names.ts';
import { MemoryRing, NdjsonSink } from './sinks.ts';
import type { TraceFields, TraceLevel, TraceMetric, TraceSink } from './types.ts';

export interface TraceSpan {
  end(fields?: TraceFields): void;
  fail(error: Error | { code: string; message: string }): void;
}

function assertFields(fields: TraceFields): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value === null) continue;
    const kind = typeof value;
    if (kind !== 'string' && kind !== 'number' && kind !== 'boolean') {
      throw new Error(`trace field "${key}" must be a string, number, boolean, or null`);
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`trace field "${key}" must be a finite number`);
    }
  }
}

export class Trace {
  private seq = 0;
  private spans = 0;

  constructor(
    private readonly sinks: TraceSink[],
    private readonly now: () => Date = () => new Date(),
  ) {
    this.event('trace.ready', { sinks: sinks.length });
  }

  event(name: string, fields: TraceFields = {}, level: TraceLevel = 'info'): void {
    if (!name) throw new Error('trace event name is required');
    assertTraceName(name);
    assertFields(fields);
    this.seq += 1;
    const record = {
      kind: 'event' as const,
      v: 1 as const,
      seq: this.seq,
      t: this.now().toISOString(),
      name,
      level,
      fields,
    };
    for (const sink of this.sinks) sink.write(record);
  }

  metric(name: string, value: number, unit: string, fields: TraceFields = {}): void {
    if (!name) throw new Error('trace metric name is required');
    assertTraceName(name);
    if (!Number.isFinite(value)) throw new Error(`trace metric "${name}" must be finite`);
    if (!unit) throw new Error(`trace metric "${name}" needs a unit`);
    assertFields(fields);
    this.seq += 1;
    const record: TraceMetric = {
      kind: 'metric',
      v: 1,
      seq: this.seq,
      t: this.now().toISOString(),
      name,
      value,
      unit,
      fields,
    };
    for (const sink of this.sinks) sink.write(record);
  }

  span(name: string, fields: TraceFields = {}): TraceSpan {
    assertTraceName(name);
    this.spans += 1;
    const id = `s${this.spans}`;
    const started = performance.now();
    this.event(name, { ...fields, span: id });
    let closed = false;
    return {
      end: (extra: TraceFields = {}) => {
        if (closed) return;
        closed = true;
        this.event(name, { ...fields, ...extra, span: id, dur: Math.max(0, performance.now() - started) });
      },
      fail: (error: Error | { code: string; message: string }) => {
        if (closed) return;
        closed = true;
        const message = error instanceof Error ? error.message : error.message;
        const code = error instanceof Error ? 'error' : error.code;
        this.event('error', { code, where: name, message }, 'error');
        this.event(name, { ...fields, span: id, dur: Math.max(0, performance.now() - started), ok: false });
      },
    };
  }
}

export interface CreateTraceOptions {
  ring?: MemoryRing;
  ndjson?: (line: string) => void;
  now?: () => Date;
}

export function createTrace(options: CreateTraceOptions = {}): { trace: Trace; ring: MemoryRing } {
  const ring = options.ring ?? new MemoryRing();
  const sinks: TraceSink[] = [ring];
  if (options.ndjson) sinks.push(new NdjsonSink(options.ndjson));
  return { trace: new Trace(sinks, options.now), ring };
}
