import { el } from '@elemaudio/core';
import { sha256Hex, type SampleSource, type ToneEffect } from '@toolpa/graph';
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

export class SampleVfs {
  private readonly buffers = new Map<string, Float32Array>();

  async register(
    bytes: Uint8Array,
    pcm: Float32Array,
    claimed?: string,
    trace?: Trace,
  ): Promise<{ key: string; inserted: boolean }> {
    const key = await sha256Hex(bytes);
    if (claimed && claimed !== key) {
      throw new SampleError('VFS_KEY_MISMATCH', `VFS_KEY_MISMATCH: claimed key ${claimed} does not match the file bytes`);
    }
    const inserted = !this.buffers.has(key);
    if (inserted) this.buffers.set(key, pcm);
    trace?.event('vfs.register', { sha256: key, bytes: bytes.byteLength, inserted });
    return { key, inserted };
  }

  copy(key: string): Float32Array {
    const pcm = this.buffers.get(key);
    if (!pcm) throw new SampleError('missing', `no sample buffer for ${key}`);
    const out = new Float32Array(pcm.length);
    out.set(pcm);
    return out;
  }
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
