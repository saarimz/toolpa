import type { Trace } from '@toolpa/trace';

export interface MeterSummary {
  peak: number;
  rms: number;
}

export function measure(pcm: Float32Array): MeterSummary {
  let peak = 0;
  let energy = 0;
  for (let i = 0; i < pcm.length; i += 1) {
    const sample = pcm[i] ?? 0;
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
    energy += sample * sample;
  }
  return { peak, rms: pcm.length === 0 ? 0 : Math.sqrt(energy / pcm.length) };
}

export function traceMeter(summary: MeterSummary, trace?: Trace): void {
  trace?.event('meter.summary', { peak: summary.peak, rms: summary.rms });
  trace?.metric('meter.peak', summary.peak, 'amp');
  trace?.metric('meter.rms', summary.rms, 'amp');
}
