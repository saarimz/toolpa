import type { TraceRecord, TraceSink } from './types.ts';

export class MemoryRing implements TraceSink {
  readonly records: TraceRecord[] = [];

  constructor(readonly capacity = 256) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(`ring capacity must be a positive integer, got ${capacity}`);
    }
  }

  write(record: TraceRecord): void {
    this.records.push(record);
    if (this.records.length > this.capacity) {
      this.records.splice(0, this.records.length - this.capacity);
    }
  }

  snapshot(): TraceRecord[] {
    return this.records.slice();
  }

  clear(): void {
    this.records.length = 0;
  }
}

export class NdjsonSink implements TraceSink {
  constructor(private readonly writeLine: (line: string) => void) {}

  write(record: TraceRecord): void {
    this.writeLine(`${JSON.stringify(record)}\n`);
  }
}
