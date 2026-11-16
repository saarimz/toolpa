import { el } from '@elemaudio/core';
import { packToolpa, unpackToolpa } from '../../artifact/src/zip.ts';
import { decodeWavSample } from '@toolpa/samples';
import { createTrace } from '@toolpa/trace';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENGINE_VERSIONS, compareRenders, renderChain, renderNode, type SampleBuffer } from './index.ts';
import { encodeWavPcm16 } from './wav.ts';

const tone = { type: 'tone' as const, cutoffHz: 2000, q: 0.7071067811865476, gain: 0.25 };
const sineChain = {
  kind: 'chain' as const,
  version: 1 as const,
  sampleRate: 44100,
  source: { type: 'sine' as const, frequencyHz: 440 },
  effect: tone,
};
const noiseChain = {
  ...sineChain,
  source: { type: 'noise' as const, seed: 11 },
};

function sampleWav(): Uint8Array {
  const pcm = new Float32Array(1800);
  for (let i = 0; i < pcm.length; i += 1) pcm[i] = Math.sin((2 * Math.PI * 330 * i) / 44100) * 0.8;
  return encodeWavPcm16(pcm, 44100);
}

async function sampleChain(): Promise<{ chain: typeof sineChain; samples: Map<string, SampleBuffer> }> {
  const decoded = await decodeWavSample(sampleWav());
  return {
    chain: {
      ...sineChain,
      effect: { ...tone, cutoffHz: 8000, gain: 0.5 },
      source: { type: 'sample', sha256: decoded.sha256, playbackRate: 1 },
    },
    samples: new Map([[decoded.sha256, { sampleRate: decoded.sampleRate, pcm: decoded.pcm }]]),
  };
}

interface Golden {
  hash: string;
  wavSha256: string;
  frames: number;
  peak: number;
  rms: number;
}

function goldenPath(name: string): string {
  return new URL(`../goldens/${name}.json`, import.meta.url);
}

function checkGolden(name: string, actual: Golden): void {
  const path = goldenPath(name);
  if (process.env.UPDATE_GOLDENS === '1') {
    mkdirSync(new URL('../goldens/', import.meta.url), { recursive: true });
    writeFileSync(path, `${JSON.stringify(actual, null, 2)}\n`);
    return;
  }
  const expected = JSON.parse(readFileSync(path, 'utf8')) as Golden;
  expect(actual).toEqual(expected);
}

describe('offline render', () => {
  it('renders sine, noise, and a keyed sample to deterministic WAV goldens', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const sine = await renderChain({ chain: sineChain, durationSeconds: 0.25 }, trace);
    const sineAgain = await renderChain({ chain: sineChain, durationSeconds: 0.25 });
    expect(sineAgain.wav).toEqual(sine.wav);
    compareRenders(sine.wav, sineAgain.wav, sine.hash, trace);
    expect(sine.format).toBe('pcm16');
    const pcm24 = await renderChain({ chain: sineChain, durationSeconds: 0.25, format: 'pcm24' });
    const pcm24Again = await renderChain({ chain: sineChain, durationSeconds: 0.25, format: 'pcm24' });
    expect(pcm24Again.wav).toEqual(pcm24.wav);
    const float32 = await renderChain({ chain: sineChain, durationSeconds: 0.25, format: 'float32' });
    const float32Again = await renderChain({ chain: sineChain, durationSeconds: 0.25, format: 'float32' });
    expect(float32Again.wav).toEqual(float32.wav);
    const formats = JSON.parse(readFileSync(new URL('../goldens/formats.json', import.meta.url), 'utf8')) as {
      pcm16: string;
      pcm24: string;
      float32: string;
    };
    if (process.env.UPDATE_GOLDENS === '1') {
      writeFileSync(
        new URL('../goldens/formats.json', import.meta.url),
        `${JSON.stringify({ pcm16: sine.wavSha256, pcm24: pcm24.wavSha256, float32: float32.wavSha256 }, null, 2)}\n`,
      );
    }
    expect(sine.wavSha256).toBe(formats.pcm16);
    expect(pcm24.wavSha256).toBe(formats.pcm24);
    expect(float32.wavSha256).toBe(formats.float32);
    expect(sine.realtime).toBeGreaterThan(0.5);
    expect(sine.meter.peak).toBeGreaterThan(0.1);
    checkGolden('sine', {
      hash: sine.hash,
      wavSha256: sine.wavSha256,
      frames: sine.frames,
      peak: sine.meter.peak,
      rms: sine.meter.rms,
    });

    const noise = await renderChain({ chain: noiseChain, durationSeconds: 0.25 }, trace);
    const noiseAgain = await renderChain({ chain: noiseChain, durationSeconds: 0.25 });
    expect(noiseAgain.wavSha256).toBe(noise.wavSha256);
    expect(noise.hash).not.toBe(sine.hash);
    checkGolden('noise', {
      hash: noise.hash,
      wavSha256: noise.wavSha256,
      frames: noise.frames,
      peak: noise.meter.peak,
      rms: noise.meter.rms,
    });

    const sample = await sampleChain();
    const rendered = await renderChain(
      { chain: sample.chain, durationSeconds: 0.1, samples: sample.samples },
      trace,
    );
    const renderedAgain = await renderChain({ chain: sample.chain, durationSeconds: 0.1, samples: sample.samples });
    expect(renderedAgain.pcm).toEqual(rendered.pcm);
    expect(rendered.meter.peak).toBeGreaterThan(0.05);
    checkGolden('sample', {
      hash: rendered.hash,
      wavSha256: rendered.wavSha256,
      frames: rendered.frames,
      peak: rendered.meter.peak,
      rms: rendered.meter.rms,
    });

    const records = lines.map((line) => JSON.parse(line.trim()));
    expect(records.filter((record) => record.name === 'render.offline')).toHaveLength(3);
    expect(records.some((record) => record.name === 'render.twice' && record.fields.identical === true)).toBe(true);
    expect(records.some((record) => record.name === 'engine.lower' && record.fields.svf === 1)).toBe(true);
    expect(records.some((record) => record.name === 'ir.validate')).toBe(true);
    expect(records.some((record) => record.name === 'ir.hash')).toBe(true);
    expect(records.some((record) => record.name === 'render.realtime' && record.unit === 'x')).toBe(true);
    expect(records.some((record) => record.name === 'graph.hashed')).toBe(true);
    trace.event('golden.check', { name: 'sine', ok: true });
    expect(records.concat(lines.slice(-1).map((line) => JSON.parse(line.trim()))).some((record) => record.name === 'golden.check')).toBe(true);
  });

  it('rejects a non-finite render and records render.nan', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    await expect(
      renderNode(el.const({ value: Number.POSITIVE_INFINITY }), { sampleRate: 48000, frames: 32, trace }),
    ).rejects.toThrow(/ENGINE_NAN/);
    const records = lines.map((line) => JSON.parse(line.trim()));
    expect(records.some((record) => record.name === 'render.nan')).toBe(true);
  });

  it('renders the same WAV after a .toolpa round trip', async () => {
    const packed = await packToolpa({ chain: sineChain, title: 'Sine', name: 'sine', seq: 1 });
    const opened = await unpackToolpa(packed.bytes);
    const direct = await renderChain({ chain: sineChain, durationSeconds: 0.05 });
    const restored = await renderChain({ chain: opened.chain, durationSeconds: 0.05 });
    expect(restored.wav).toEqual(direct.wav);
    expect(restored.hash).toBe(direct.hash);
  });

  it('reports the Elementary versions pinned in the package', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['@elemaudio/core']).toBe(ENGINE_VERSIONS['@elemaudio/core']);
    expect(pkg.dependencies['@elemaudio/offline-renderer']).toBe(ENGINE_VERSIONS['@elemaudio/offline-renderer']);
    expect(pkg.dependencies['@elemaudio/web-renderer']).toBe(ENGINE_VERSIONS['@elemaudio/web-renderer']);
  });
});
