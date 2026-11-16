export type TraceLevel = 'debug' | 'info' | 'warn' | 'error';

export type TracePrimitive = string | number | boolean | null;

export type TraceFields = Record<string, TracePrimitive>;

export interface TraceEvent {
  kind: 'event';
  v: 1;
  seq: number;
  t: string;
  name: string;
  level: TraceLevel;
  fields: TraceFields;
}

export interface TraceMetric {
  kind: 'metric';
  v: 1;
  seq: number;
  t: string;
  name: string;
  value: number;
  unit: string;
  fields: TraceFields;
}

export type TraceRecord = TraceEvent | TraceMetric;

export interface TraceSink {
  write(record: TraceRecord): void;
}
