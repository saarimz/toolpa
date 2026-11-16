import { renderInstrument } from '../src/instrument.ts';
import { cookbookSelfCheck } from '../src/cookbook.ts';
import { inputSelfCheck } from '../src/input.ts';
import { samplerSelfCheck } from '../src/sampler.ts';
import { effectSelfCheck } from '../src/effects.ts';
import { synthSelfCheck } from '../src/synth.ts';
import { installNetworkGuard, MemoryRing, createTrace } from '@toolpa/trace';

const ring = new MemoryRing(64);
const { trace } = createTrace({ ring });
installNetworkGuard({
  allow: (url) => url.startsWith('blob:') || url.startsWith(location.origin),
  trace,
});

const instrument = {
  kind: 'instrument',
  version: 1,
  sampleRate: 44100,
  voice: { type: 'sine', attackSeconds: 0.005, decaySeconds: 0.04, sustain: 0.8, releaseSeconds: 0.03 },
  maxVoices: 4,
  notes: [
    { midi: 60, startSeconds: 0, durationSeconds: 0.25, velocity: 100 },
    { midi: 64, startSeconds: 0.05, durationSeconds: 0.25, velocity: 90 },
  ],
  effect: { type: 'tone', cutoffHz: 4000, q: 0.7071067811865476, gain: 0.4 },
};

const api = {
  synth: () => synthSelfCheck(),
  effects: () => effectSelfCheck(),
  sampler: () => samplerSelfCheck(),
  input: () => inputSelfCheck(),
  cookbook: () => cookbookSelfCheck(),
  async run() {
    const first = await renderInstrument({ instrument, durationSeconds: 0.4 }, trace);
    const second = await renderInstrument({ instrument, durationSeconds: 0.4 });
    let identical = first.wav.byteLength === second.wav.byteLength;
    for (let index = 0; index < first.wav.byteLength && identical; index += 1) {
      if (first.wav[index] !== second.wav[index]) identical = false;
    }
    let peak = 0;
    for (const sample of first.pcm) peak = Math.max(peak, Math.abs(sample));
    return {
      hash: first.hash,
      identical,
      svf: first.svf,
      peak,
      names: ring.snapshot().map((record) => record.name),
    };
  },
};

declare global {
  interface Window {
    __toolpaInstrument: typeof api;
  }
}

window.__toolpaInstrument = api;
