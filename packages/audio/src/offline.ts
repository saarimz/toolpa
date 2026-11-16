import { el } from '@elemaudio/core';
import OfflineRenderer from '@elemaudio/offline-renderer';
import type { NoiseSource, SineSource } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';

export function buildSine(source: SineSource) {
  return el.cycle(source.frequencyHz);
}

export function buildNoise(source: NoiseSource) {
  return el.noise({ seed: source.seed, key: 'noise' });
}

export class EngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

export function assertFinitePcm(pcm: Float32Array, trace?: Trace): void {
  for (let i = 0; i < pcm.length; i += 1) {
    if (!Number.isFinite(pcm[i] ?? Number.NaN)) {
      trace?.event('render.nan', { index: i });
      throw new EngineError('ENGINE_NAN', `ENGINE_NAN: non-finite sample at frame ${i}`);
    }
  }
}

export async function renderNode(
  node: unknown,
  options: { sampleRate: number; frames: number; vfs?: Record<string, Float32Array>; trace?: Trace },
): Promise<Float32Array> {
  const core = new OfflineRenderer();
  await core.initialize({
    numInputChannels: 0,
    numOutputChannels: 1,
    sampleRate: options.sampleRate,
  });
  if (options.vfs) core.updateVirtualFileSystem(options.vfs);
  core.render(node);
  const pcm = new Float32Array(options.frames);
  core.process([], [pcm]);
  assertFinitePcm(pcm, options.trace);
  return pcm;
}

export async function renderSource(
  source: SineSource | NoiseSource,
  options: { sampleRate: number; frames: number },
  trace?: Trace,
): Promise<Float32Array> {
  const node = source.type === 'sine' ? buildSine(source) : buildNoise(source);
  const pcm = await renderNode(node, options);
  trace?.event('source.rendered', {
    type: source.type,
    sampleRate: options.sampleRate,
    frames: options.frames,
  });
  return pcm;
}
