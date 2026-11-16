import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import { readSamplePack, renderStems, writeSamplePack, writeSfz, writeSmf } from './pack.ts';

const sineGolden = JSON.parse(readFileSync(new URL('../../audio/goldens/sine.json', import.meta.url), 'utf8')) as { hash: string };
const sha = 'ab'.repeat(32);

describe('stems, SMF, SFZ, and sample packs', () => {
  it('writes the committed SMF fixture', () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const bytes = writeSmf([{ midi: 60, startTick: 0, durationTicks: 960, velocity: 100 }], trace);
    expect(bytes).toEqual(writeSmf([{ midi: 60, startTick: 0, durationTicks: 960, velocity: 100 }]));
    expect([...bytes.subarray(0, 14)]).toEqual([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x03, 0xc0]);
    expect(bytes).toEqual(
      Uint8Array.from([
        0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x03, 0xc0,
        0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, 0x14,
        0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
        0x00, 0x90, 0x3c, 0x64,
        0x87, 0x40, 0x80, 0x3c, 0x00,
        0x00, 0xff, 0x2f, 0x00,
      ]),
    );
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('export.smf');
  });

  it('writes an SFZ region and packs it with the wav', () => {
    const sfz = writeSfz(sha, 60);
    expect(sfz).toBe(`<group>\n<region>\nsample=samples/${sha}.wav\nlokey=60\nhikey=60\npitch_keycenter=60\n`);
    const wav = Uint8Array.of(1, 2, 3, 4);
    const packed = writeSamplePack(sha, 60, wav);
    expect(readSamplePack(packed)).toEqual(['instrument.sfz', `samples/${sha}.wav`]);
  });

  it('keeps the dry stem different from the wet stem and leaves the sine golden', async () => {
    const stems = await renderStems();
    expect(stems.dry.wavSha256).not.toBe(stems.wet.wavSha256);
    expect(stems.wet.wav).toEqual((await renderStems()).wet.wav);
    expect(sineGolden.hash).toBe('59d86cf3314f9c8c44bd7b2523a400c4191e27eed50e80434d753d4616dc94b8');
  });

  it('renders a chain file from the command', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'toolpa-'));
    const input = path.join(dir, 'chain.json');
    const output = path.join(dir, 'out.wav');
    writeFileSync(
      input,
      JSON.stringify({
        kind: 'chain',
        version: 1,
        sampleRate: 44100,
        source: { type: 'sine', frequencyHz: 440 },
        effect: { type: 'tone', cutoffHz: 2000, q: 0.7071067811865476, gain: 0.25 },
      }),
    );
    const result = spawnSync('node', ['--experimental-transform-types', 'scripts/toolpa.ts', 'render', input, output], {
      cwd: path.resolve(new URL('../../../', import.meta.url).pathname),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(sineGolden.hash);
  });
});
