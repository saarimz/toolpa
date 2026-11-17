import { el } from '@elemaudio/core';
import { sha256Hex } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';
import { renderNode } from './offline.ts';
import { encodeWav } from './wav.ts';

export class EffectError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EffectError';
  }
}

export function samplesForBeats(bpm: number, beats: number, sampleRate: number): number {
  if (!(bpm >= 20) || bpm > 300 || !(beats > 0) || beats > 4) {
    throw new EffectError('EFFECT_DELAY', 'EFFECT_DELAY: bpm is 20..300 and beats are 0..4');
  }
  return Math.round((60 / bpm) * beats * sampleRate);
}

type Node = ReturnType<typeof el.cycle>;

function source(frequency = 220): Node {
  return el.mul(0.4, el.cycle(frequency));
}

export function delayNode(input: Node, bpm: number, beats: number, feedback: number, sampleRate: number): Node {
  if (!Number.isFinite(feedback) || feedback < 0 || feedback >= 0.95) {
    throw new EffectError('EFFECT_DELAY', 'EFFECT_DELAY: feedback must be finite and inside 0..0.95');
  }
  const length = samplesForBeats(bpm, beats, sampleRate);
  return el.add(el.mul(0.6, input), el.mul(0.4, el.delay({ key: 'delay', size: length + 8 }, length, feedback, input)));
}

export function reverbImpulse(length = 256): Float32Array {
  const impulse = new Float32Array(length);
  for (let index = 0; index < length; index += 1) impulse[index] = index === 0 ? 1 : 0.55 * 0.96 ** index;
  return impulse;
}

export function reverbNode(input: Node): Node {
  return el.convolve({ key: 'reverb', path: 'reverb-ir', size: 256 }, input);
}

export function compressorNode(input: Node, thresholdDb = -18, ratio = 4): Node {
  if (!Number.isFinite(thresholdDb) || !Number.isFinite(ratio) || ratio < 1 || ratio > 40) {
    throw new EffectError('EFFECT_DYNAMICS', 'EFFECT_DYNAMICS: ratio must be finite and inside 1..40');
  }
  return el.compress(8, 80, thresholdDb, ratio, input, input);
}

export function limiterNode(input: Node): Node {
  return compressorNode(input, -8, 20);
}

export function eqNode(input: Node): Node {
  const low = el.lowshelf(180, 0.7, 3, input);
  const mid = el.peak(1200, 0.9, -2, low);
  return el.highshelf(6000, 0.7, 1.5, mid);
}

export function distortNode(input: Node, drive = 4): Node {
  if (!Number.isFinite(drive) || drive < 1 || drive > 40) throw new EffectError('EFFECT_DRIVE', 'EFFECT_DRIVE: drive must be finite and inside 1..40');
  return el.tanh(el.mul(drive, input));
}

export function chorusNode(input: Node, sampleRate: number): Node {
  const depth = Math.round(0.004 * sampleRate);
  const length = el.add(Math.round(0.018 * sampleRate), el.mul(depth, el.add(1, el.cycle(0.4))));
  const wet = el.delay({ key: 'chorus', size: Math.round(0.03 * sampleRate) }, length, 0, input);
  return el.add(el.mul(0.7, input), el.mul(0.3, wet));
}

async function renderEffect(name: string, node: Node, sampleRate: number, trace?: Trace, vfs?: Record<string, Float32Array>) {
  const frames = Math.round(0.08 * sampleRate);
  const pcm = await renderNode(node, { sampleRate, frames, vfs, trace });
  let sum = 0;
  let peak = 0;
  for (const sample of pcm) {
    peak = Math.max(peak, Math.abs(sample));
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / pcm.length);
  const wav = encodeWav(pcm, sampleRate, { format: 'float32' });
  const wavSha256 = await sha256Hex(wav);
  trace?.event('effect.apply', { effect: name, peak, rms });
  return { wavSha256, peak, rms };
}

export async function renderEffectSuite(trace?: Trace) {
  const sampleRate = 44100;
  const dry = source();
  const dryRender = await renderEffect('dry', dry, sampleRate, trace);
  const delay = await renderEffect('delay', delayNode(dry, 120, 0.25, 0.35, sampleRate), sampleRate, trace);
  const reverb = await renderEffect('reverb', reverbNode(dry), sampleRate, trace, { 'reverb-ir': reverbImpulse() });
  const compressor = await renderEffect('compressor', compressorNode(dry), sampleRate, trace);
  const limiter = await renderEffect('limiter', limiterNode(dry), sampleRate, trace);
  const eq = await renderEffect('eq', eqNode(dry), sampleRate, trace);
  const distort = await renderEffect('distort', distortNode(dry, 6), sampleRate, trace);
  const chorus = await renderEffect('chorus', chorusNode(dry, sampleRate), sampleRate, trace);
  return { dry: dryRender, delay, reverb, compressor, limiter, eq, distort, chorus };
}

export async function effectSelfCheck() {
  const rendered = await renderEffectSuite();
  return {
    delay: rendered.delay.wavSha256,
    different: rendered.delay.wavSha256 !== rendered.dry.wavSha256 && rendered.reverb.wavSha256 !== rendered.dry.wavSha256,
    beats: samplesForBeats(120, 1, 44100),
  };
}
