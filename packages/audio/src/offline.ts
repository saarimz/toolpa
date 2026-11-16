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

export async function renderNode(
  node: unknown,
  options: { sampleRate: number; frames: number; vfs?: Record<string, Float32Array> },
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
