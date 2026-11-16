import { el } from '@elemaudio/core';
import type { SampleSource, ToneEffect } from '@toolpa/graph';
import { SampleError } from '@toolpa/samples';
import type { Trace } from '@toolpa/trace';
import { renderNode } from './offline.ts';
import { applyTone } from './tone.ts';

export function buildSample(source: SampleSource) {
  return el.sample(
    { path: source.sha256, mode: 'trigger', key: `sample:${source.sha256}` },
    el.train(0),
    source.playbackRate,
  );
}

export function bufferFor(sha256: string, samples: ReadonlyMap<string, Float32Array>): Float32Array {
  const pcm = samples.get(sha256);
  if (!pcm || pcm.length === 0) throw new SampleError('missing', `no sample buffer for ${sha256}`);
  return pcm;
}

export async function renderKeyedSample(
  options: {
    sha256: string;
    samples: ReadonlyMap<string, Float32Array>;
    playbackRate: number;
    sampleRate: number;
    frames: number;
    effect: ToneEffect;
  },
  trace?: Trace,
): Promise<Float32Array> {
  const pcm = bufferFor(options.sha256, options.samples);
  trace?.event('source.sample', {
    sha256: options.sha256,
    frames: pcm.length,
    playbackRate: options.playbackRate,
  });
  const node = applyTone(
    buildSample({ type: 'sample', sha256: options.sha256, playbackRate: options.playbackRate }),
    options.effect,
    trace,
  );
  return renderNode(node, {
    sampleRate: options.sampleRate,
    frames: options.frames,
    vfs: { [options.sha256]: pcm },
  });
}
