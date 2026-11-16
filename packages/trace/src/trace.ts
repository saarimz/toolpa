import { MemoryRing, NdjsonSink } from './sinks.ts';
import type { TraceFields, TraceLevel, TraceMetric, TraceSink } from './types.ts';

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
  constructor(
    private readonly sinks: TraceSink[],
    private readonly now: () => Date = () => new Date(),
  ) {
    this.event('trace.ready', { sinks: sinks.length });
  }

  event(name: string, fields: TraceFields = {}, level: TraceLevel = 'info'): void {
    if (!name) throw new Error('trace event name is required');
    assertFields(fields);
    const record = {
      kind: 'event' as const,
      t: this.now().toISOString(),
      name,
      level,
      fields,
    };
    for (const sink of this.sinks) sink.write(record);
  }

  metric(name: string, value: number, unit: string, fields: TraceFields = {}): void {
    if (!name) throw new Error('trace metric name is required');
    if (!Number.isFinite(value)) throw new Error(`trace metric "${name}" must be finite`);
    if (!unit) throw new Error(`trace metric "${name}" needs a unit`);
    assertFields(fields);
    const record: TraceMetric = {
      kind: 'metric',
      t: this.now().toISOString(),
      name,
      value,
      unit,
      fields,
    };
    for (const sink of this.sinks) sink.write(record);
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
