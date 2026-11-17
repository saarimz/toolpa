import { mkdirSync, writeFileSync } from 'node:fs';
import { lowerPromptGraph, type PromptGraph } from '../packages/audio/src/prompt.ts';
import { renderNode } from '../packages/audio/src/offline.ts';
import { remoteInstrumentModel, runInstrumentAgent, settingsFromEnv, type ProviderKind } from '../packages/agent/src/index.ts';

export const EVAL_PROMPTS = [
  'warm detuned pad with slow filter sweep and a little reverb',
  'punchy analog bass with a short envelope',
  'glassy bell with a long release',
  'plucked string',
  'soft electric piano keys',
  'slow string ensemble',
  'screaming lead with glide and delay',
  'dark drone with a slow pitch wobble',
  '808 kick and sub',
  'noise riser fx',
  'airy choir pad',
  'percussive mallet',
];

function bands(pcm: Float32Array): { freq: number; energy: number }[] {
  const sampleRate = 44100;
  return [80, 200, 800, 3000].map((freq) => {
    let real = 0;
    let imag = 0;
    const length = Math.min(pcm.length, 4096);
    for (let index = 0; index < length; index += 1) {
      const sample = pcm[index] ?? 0;
      const angle = (2 * Math.PI * freq * index) / sampleRate;
      real += sample * Math.cos(angle);
      imag -= sample * Math.sin(angle);
    }
    return { freq, energy: Math.round((Math.hypot(real, imag) / length) * 10000) / 10000 };
  });
}

function providerKind(): ProviderKind {
  const selected = process.env.TOOLPA_MODEL_PROVIDER ?? 'cloudflare-gateway';
  if (selected === 'vercel-gateway' || selected === 'openai-compatible' || selected === 'openai' || selected === 'ollama' || selected === 'cloudflare-gateway') {
    return selected === 'openai' ? 'openai-compatible' : selected;
  }
  throw new Error(`TOOLPA_MODEL_PROVIDER ${selected} cannot run eval-prompts`);
}

export async function evalPrompts(): Promise<void> {
  if (process.env.TOOLPA_ALLOW_NETWORK !== '1') {
    process.stderr.write('TOOLPA_ALLOW_NETWORK is not 1. Refusing to call a model.\n');
    process.exit(1);
  }
  const kind = providerKind();
  const model = remoteInstrumentModel(settingsFromEnv(kind));
  const rows: Record<string, unknown>[] = [];
  for (const prompt of EVAL_PROMPTS) {
    const started = Date.now();
    try {
      let pcm = new Float32Array();
      const result = await runInstrumentAgent(prompt, {
        maxAttempts: 3,
        model,
        render: async (doc: PromptGraph) => {
          const lowered = lowerPromptGraph(doc, 0.35);
          pcm = await renderNode(lowered.node, { sampleRate: 44100, frames: Math.round(0.45 * 44100), vfs: lowered.vfs });
          let peak = 0;
          let nan = false;
          for (const sample of pcm) {
            if (!Number.isFinite(sample)) nan = true;
            else peak = Math.max(peak, Math.abs(sample));
          }
          return { peak, nan };
        },
      });
      const spectrum = bands(pcm);
      const audible = spectrum.some((band) => band.energy > 0.0001);
      rows.push({
        prompt,
        ok: true,
        hash: result.hash,
        attempts: result.attempts,
        adjusted: result.adjusted,
        parseFailure: null,
        latencyMs: Date.now() - started,
        name: result.document.name,
        spectrum,
        sane: audible && !result.document.oscillators.every((osc) => osc.level === 0),
      });
    } catch (error) {
      rows.push({
        prompt,
        ok: false,
        hash: null,
        attempts: 3,
        adjusted: false,
        parseFailure: error instanceof Error ? error.message : 'error',
        latencyMs: Date.now() - started,
        spectrum: [],
        sane: false,
      });
    }
    process.stdout.write(`${prompt}\n`);
  }
  const hashes = new Set(rows.map((row) => row.hash).filter((hash) => typeof hash === 'string'));
  const report = {
    provider: kind,
    model: process.env.TOOLPA_MODEL ?? '',
    prompts: rows.length,
    distinctHashes: hashes.size,
    failures: rows.filter((row) => row.ok === false).length,
    rows,
  };
  mkdirSync('tmp', { recursive: true });
  writeFileSync('tmp/prompt-eval.json', `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`distinct hashes ${hashes.size} of ${rows.length}, failures ${report.failures}, wrote tmp/prompt-eval.json\n`);
}
