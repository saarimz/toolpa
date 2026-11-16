import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { renderChain } from '../packages/audio/src/index.ts';
import { encodeWavPcm16 } from '../packages/audio/src/wav.ts';
import { decodeSample, decodeWavSample } from '../packages/samples/src/index.ts';
import { createTrace } from '../packages/trace/src/index.ts';

const tone = { type: 'tone' as const, cutoffHz: 2000, q: 0.7071067811865476, gain: 0.25 };
const sineChain = {
  kind: 'chain' as const,
  version: 1 as const,
  sampleRate: 44100,
  source: { type: 'sine' as const, frequencyHz: 440 },
  effect: tone,
};
const noiseChain = { ...sineChain, source: { type: 'noise' as const, seed: 11 } };

function countPlaywright(path: string): Record<string, { passed: number; failed: number; skipped: number }> {
  const report = JSON.parse(readFileSync(path, 'utf8')) as { suites?: Suite[] };
  const counts: Record<string, { passed: number; failed: number; skipped: number }> = {};
  const visit = (suite: Suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const project = test.projectName ?? 'unknown';
        const status = test.results?.at(-1)?.status ?? 'failed';
        const bucket = (counts[project] ??= { passed: 0, failed: 0, skipped: 0 });
        if (status === 'passed') bucket.passed += 1;
        else if (status === 'skipped') bucket.skipped += 1;
        else bucket.failed += 1;
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
  return counts;
}

interface Suite {
  specs?: Array<{ tests?: Array<{ projectName?: string; results?: Array<{ status?: string }> }> }>;
  suites?: Suite[];
}

function sampleWav(): Uint8Array {
  const pcm = new Float32Array(1800);
  for (let i = 0; i < pcm.length; i += 1) pcm[i] = Math.sin((2 * Math.PI * 330 * i) / 44100) * 0.8;
  return encodeWavPcm16(pcm, 44100);
}

const lines: string[] = [];
const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
const sine = await renderChain({ chain: sineChain, durationSeconds: 0.25 }, trace);
const noise = await renderChain({ chain: noiseChain, durationSeconds: 0.25 }, trace);
const decodedSample = await decodeWavSample(sampleWav(), trace);
const sample = await renderChain(
  {
    chain: {
      ...sineChain,
      effect: { ...tone, cutoffHz: 8000, gain: 0.5 },
      source: { type: 'sample', sha256: decodedSample.sha256, playbackRate: 1 },
    },
    durationSeconds: 0.1,
    samples: new Map([[decodedSample.sha256, { sampleRate: decodedSample.sampleRate, pcm: decodedSample.pcm }]]),
  },
  trace,
);
const mp3 = await decodeSample(readFileSync('packages/samples/fixtures/tone.mp3'), trace);
const golden = {
  sine: JSON.parse(readFileSync('packages/audio/goldens/sine.json', 'utf8')) as { hash: string; wavSha256: string },
  noise: JSON.parse(readFileSync('packages/audio/goldens/noise.json', 'utf8')) as { hash: string; wavSha256: string },
  sample: JSON.parse(readFileSync('packages/audio/goldens/sample.json', 'utf8')) as { hash: string; wavSha256: string },
};
const goldenOk =
  sine.hash === golden.sine.hash &&
  sine.wavSha256 === golden.sine.wavSha256 &&
  noise.hash === golden.noise.hash &&
  noise.wavSha256 === golden.noise.wavSha256 &&
  sample.hash === golden.sample.hash &&
  sample.wavSha256 === golden.sample.wavSha256;

const unit = existsSync('tmp/vitest.json')
  ? (JSON.parse(readFileSync('tmp/vitest.json', 'utf8')) as { numPassedTests?: number; numFailedTests?: number })
  : {};
const browsers = existsSync('tmp/playwright.json') ? countPlaywright('tmp/playwright.json') : {};
const live = readdirSync('tmp')
  .filter((name) => name.startsWith('live-') && name.endsWith('.json'))
  .sort()
  .map((name) => ({
    browser: name.slice('live-'.length, -'.json'.length),
    ...(JSON.parse(readFileSync(`tmp/${name}`, 'utf8')) as {
      baseLatencyMs: number;
      outputLatencyMs: number;
      underruns: number;
      peak: number;
    }),
  }));

const records = lines.map(
  (line) => JSON.parse(line.trim()) as { name: string; value?: number; fields?: { format?: string } },
);

console.log('\nToolpa slice gate');
console.log(`unit tests: ${unit.numPassedTests ?? 0} passed, ${unit.numFailedTests ?? 0} failed`);
for (const [project, count] of Object.entries(browsers)) {
  console.log(`browser ${project}: ${count.passed} passed, ${count.failed} failed, ${count.skipped} skipped`);
}
for (const rendered of [
  ['sine', sine],
  ['noise', noise],
  ['sample', sample],
] as const) {
  console.log(
    `render ${rendered[0]}: ${rendered[1].realtime.toFixed(2)}× realtime, ${rendered[1].renderMs.toFixed(1)} ms, hash ${rendered[1].hash.slice(0, 12)}`,
  );
}
for (const metric of records.filter((record) => record.name === 'decode.ms')) {
  console.log(`decode ${metric.fields?.format ?? 'audio'}: ${(metric.value ?? 0).toFixed(2)} ms`);
}
console.log(`decode mp3 fixture: ${mp3.decodeMs.toFixed(2)} ms, ${mp3.frames} frames`);
for (const row of live) {
  console.log(
    `playback ${row.browser}: base ${row.baseLatencyMs.toFixed(2)} ms, output ${row.outputLatencyMs.toFixed(2)} ms, underruns ${row.underruns}, peak ${row.peak.toFixed(3)}`,
  );
}
if (existsSync('tmp/non-gating.json')) {
  const note = JSON.parse(readFileSync('tmp/non-gating.json', 'utf8')) as { check?: string; browser?: string; message?: string };
  console.log(`non-gating: ${note.browser ?? 'unknown'} ${note.check ?? 'check'} — ${note.message ?? ''}`);
} else {
  console.log('non-gating: none');
}
console.log(`golden hashes: ${goldenOk ? 'match' : 'MISMATCH'}`);
process.exit(goldenOk ? 0 : 1);
