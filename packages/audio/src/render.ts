import { hashChain, sha256Hex, type Chain } from '@toolpa/graph';
import { SampleError } from '@toolpa/samples';
import type { Trace } from '@toolpa/trace';
import { measure, traceMeter, type MeterSummary } from './meter.ts';
import { renderNode } from './offline.ts';
import { buildNoise, buildSine } from './offline.ts';
import { buildSample } from './sample.ts';
import { applyTone } from './tone.ts';
import { encodeWavPcm16, resampleLinear } from './wav.ts';

export interface SampleBuffer {
  sampleRate: number;
  pcm: Float32Array;
}

export interface RenderResult {
  chain: Chain;
  hash: string;
  pcm: Float32Array;
  wav: Uint8Array;
  wavSha256: string;
  meter: MeterSummary;
  renderMs: number;
  realtime: number;
  frames: number;
}

function sourceNode(chain: Chain) {
  if (chain.source.type === 'sine') return buildSine(chain.source);
  if (chain.source.type === 'noise') return buildNoise(chain.source);
  return buildSample(chain.source);
}

export interface PreparedChain {
  chain: Chain;
  hash: string;
  node: ReturnType<typeof applyTone>;
  vfs?: Record<string, Float32Array>;
}

export async function prepareChain(
  input: { chain: unknown; samples?: ReadonlyMap<string, SampleBuffer> },
  trace?: Trace,
): Promise<PreparedChain> {
  const { chain, hash } = await hashChain(input.chain, trace);
  let vfs: Record<string, Float32Array> | undefined;
  if (chain.source.type === 'sample') {
    const buffer = input.samples?.get(chain.source.sha256);
    if (!buffer) throw new SampleError('missing', `no sample buffer for ${chain.source.sha256}`);
    const pcm = resampleLinear(buffer.pcm, buffer.sampleRate, chain.sampleRate);
    vfs = { [chain.source.sha256]: pcm };
    trace?.event('source.sample', {
      sha256: chain.source.sha256,
      frames: pcm.length,
      playbackRate: chain.source.playbackRate,
    });
  }
  return { chain, hash, node: applyTone(sourceNode(chain), chain.effect, trace), vfs };
}

export async function renderChain(
  input: {
    chain: unknown;
    durationSeconds: number;
    samples?: ReadonlyMap<string, SampleBuffer>;
  },
  trace?: Trace,
): Promise<RenderResult> {
  if (!(input.durationSeconds > 0) || input.durationSeconds > 30) {
    throw new Error('durationSeconds must be greater than 0 and at most 30');
  }
  const prepared = await prepareChain(input, trace);
  const { chain, hash, vfs } = prepared;
  const frames = Math.round(input.durationSeconds * chain.sampleRate);
  const started = performance.now();
  const pcm = await renderNode(prepared.node, {
    sampleRate: chain.sampleRate,
    frames,
    vfs,
  });
  const renderMs = performance.now() - started;
  const realtime = frames / chain.sampleRate / (renderMs / 1000);
  const meter = measure(pcm);
  traceMeter(meter, trace);
  const wav = encodeWavPcm16(pcm, chain.sampleRate);
  const wavSha256 = await sha256Hex(wav);
  trace?.event('render.offline', {
    hash,
    frames,
    sampleRate: chain.sampleRate,
    source: chain.source.type,
    wavSha256,
  });
  trace?.metric('render.ms', renderMs, 'ms', { hash, source: chain.source.type });
  trace?.metric('render.realtime', realtime, 'x', { hash, source: chain.source.type });
  return { chain, hash, pcm, wav, wavSha256, meter, renderMs, realtime, frames };
}
