import { el } from '@elemaudio/core';
import { sha256Hex } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';
import { renderNode } from './offline.ts';

export class SamplerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SamplerError';
  }
}

export interface SampleZone {
  sha256: string;
  lokey: number;
  hikey: number;
  lovel: number;
  hivel: number;
  loopStart: number;
  loopEnd: number;
}

function keyRange(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 127) throw new SamplerError('SAMPLER_ZONE', `SAMPLER_ZONE: ${label} is out of range`);
  return value;
}

export function pickZone(zones: readonly SampleZone[], midi: number, velocity: number): SampleZone {
  keyRange(midi, 'midi');
  keyRange(velocity, 'velocity');
  const matches = zones.filter((zone) => midi >= zone.lokey && midi <= zone.hikey && velocity >= zone.lovel && velocity <= zone.hivel);
  matches.sort((left, right) => left.lokey - right.lokey || left.lovel - right.lovel);
  const zone = matches[0];
  if (!zone) throw new SamplerError('SAMPLER_ZONE', 'SAMPLER_ZONE: no zone covers that note');
  return zone;
}

export function parseSfz(text: string): SampleZone[] {
  const regions = text.split(/<region>/i).slice(1);
  if (regions.length < 1 || regions.length > 128) throw new SamplerError('SFZ_IMPORT', 'SFZ_IMPORT: expected 1 to 128 regions');
  return regions.map((region) => {
    const read = (name: string) => {
      const match = region.match(new RegExp(`(?:^|\\n)\\s*${name}=([^\\n]+)`));
      return match?.[1]?.trim() ?? '';
    };
    const sample = read('sample');
    const sha = sample.match(/^samples\/([a-f0-9]{64})\.wav$/)?.[1];
    if (!sha) throw new SamplerError('SFZ_IMPORT', 'SFZ_IMPORT: sample must be samples/<sha256>.wav');
    const number = (name: string, fallback: number) => {
      const raw = read(name);
      return raw === '' ? fallback : keyRange(Number(raw), name);
    };
    const loopStart = Number(read('loop_start') || '0');
    const loopEnd = Number(read('loop_end') || '0');
    if (!Number.isInteger(loopStart) || !Number.isInteger(loopEnd) || loopStart < 0 || loopEnd < loopStart) {
      throw new SamplerError('SFZ_IMPORT', 'SFZ_IMPORT: loop points must be integers with loop_end >= loop_start');
    }
    return {
      sha256: sha,
      lokey: number('lokey', 0),
      hikey: number('hikey', 127),
      lovel: number('lovel', 0),
      hivel: number('hivel', 127),
      loopStart,
      loopEnd,
    };
  });
}

export async function renderZone(
  zone: SampleZone,
  pcm: Float32Array,
  trace?: Trace,
): Promise<{ peak: number; wavSha256: string; frames: number }> {
  if (pcm.length < 2) throw new SamplerError('SAMPLER_ZONE', 'SAMPLER_ZONE: the buffer is empty');
  const loopEnd = zone.loopEnd === 0 ? pcm.length : zone.loopEnd;
  if (loopEnd > pcm.length || loopEnd - zone.loopStart < 2) throw new SamplerError('SAMPLER_ZONE', 'SAMPLER_ZONE: the loop does not fit the buffer');
  const loopLength = loopEnd - zone.loopStart;
  const position = el.div(el.add(zone.loopStart, el.mul(loopLength, el.phasor(44100 / loopLength))), pcm.length);
  const node = el.table({ path: zone.sha256, channels: 1, key: `zone-${zone.sha256.slice(0, 8)}` }, position);
  const frames = 128;
  const rendered = await renderNode(node, { sampleRate: 44100, frames, vfs: { [zone.sha256]: pcm }, trace });
  let peak = 0;
  for (const sample of rendered) peak = Math.max(peak, Math.abs(sample));
  trace?.event('sampler.zone', { sha256: zone.sha256, midi: zone.lokey, loop: loopLength, peak });
  return { peak, wavSha256: await sha256Hex(rendered), frames };
}

export async function samplerSelfCheck(): Promise<{ zones: number; peak: number; midi: number }> {
  const sha = 'ab'.repeat(32);
  const sfz = `<group>\n<region>\nsample=samples/${sha}.wav\nlokey=60\nhikey=64\nlovel=1\nhivel=100\nloop_start=0\nloop_end=32\n`;
  const zones = parseSfz(sfz);
  const zone = pickZone(zones, 62, 80);
  const pcm = new Float32Array(32);
  pcm.fill(0.5);
  const rendered = await renderZone(zone, pcm);
  return { zones: zones.length, peak: rendered.peak, midi: zone.lokey };
}
