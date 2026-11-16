import { hashInstrument } from '@toolpa/graph';
import { installNetworkGuard, MemoryRing, createTrace } from '@toolpa/trace';
import { lowerInstrument } from '../src/instrument.ts';
import { LiveSession } from '../src/live.ts';
import { PerformanceSet } from '../src/perform.ts';

const ring = new MemoryRing(64);
const { trace } = createTrace({ ring });
installNetworkGuard({
  allow: (url) => url.startsWith('blob:') || url.startsWith(location.origin),
  trace,
});

const clip = {
  kind: 'instrument',
  version: 1,
  sampleRate: 44100,
  voice: { type: 'sine', attackSeconds: 0.01, decaySeconds: 0.05, sustain: 0.9, releaseSeconds: 0.05 },
  maxVoices: 1,
  notes: [{ midi: 69, startSeconds: 0, durationSeconds: 4, velocity: 110 }],
  effect: { type: 'tone', cutoffHz: 8000, q: 0.7071067811865476, gain: 0.8 },
};

const session = new LiveSession(trace);
const set = new PerformanceSet(
  [
    { id: 'scene-a', name: 'Scene A' },
    { id: 'scene-b', name: 'Scene B' },
  ],
  trace,
);
const status = document.getElementById('status');
function show(text: string) {
  if (status) status.textContent = text;
}
let started: { hash: string; state: string; sampleRate: number; running: boolean } | null = null;
let startError: string | null = null;

const api = {
  snapshot: () => ring.snapshot(),
  async play() {
    const { instrument, hash } = await hashInstrument(clip, trace);
    const lowered = lowerInstrument(instrument, trace);
    const context = new AudioContext({ sampleRate: instrument.sampleRate });
    trace.event('transport.launch', { bpm: 120, notes: instrument.notes.length, stepSeconds: 0.5 });
    const live = await session.startNode({ context, node: lowered.node, hash });
    return { hash: live.hash, state: context.state, sampleRate: context.sampleRate, running: live.running };
  },
  async waitForPeak(timeoutMs = 2500) {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      session.poll();
      const snap = session.snapshot();
      if (snap.peak > 0.05 && snap.running) return snap;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return session.snapshot();
  },
  learnCc: (cc: number) => set.controlChange(cc),
  started: () => started,
  startError: () => startError,
};

document.getElementById('scene-a')?.addEventListener('click', () => {
  show(`scene ${set.select('scene-a')}`);
});
document.getElementById('scene-b')?.addEventListener('click', () => {
  show(`scene ${set.select('scene-b')}`);
});
document.getElementById('learn')?.addEventListener('click', () => {
  set.armLearn('cutoff');
  show('learning cutoff');
});
document.getElementById('cc')?.addEventListener('click', () => {
  const mapped = set.controlChange(74);
  show(mapped ? `mapped ${mapped.param} ${mapped.cc}` : 'unmapped');
});
document.getElementById('launch')?.addEventListener('click', () => {
  const launched = set.launch(1.2, 1);
  show(`launch ${launched.scene} ${launched.at}`);
});
document.getElementById('xrun')?.addEventListener('click', () => {
  const snap = session.snapshot();
  const underruns = set.reportXrun(Math.max(1, snap.underruns), snap.outputLatencyMs);
  show(`xrun ${underruns}`);
});

document.getElementById('play')?.addEventListener('click', () => {
  void api.play().then(
    (value) => {
      started = value;
    },
    (error: unknown) => {
      startError = error instanceof Error ? error.message : String(error);
    },
  );
});

declare global {
  interface Window {
    __toolpaPerformance: typeof api;
  }
}

window.__toolpaPerformance = api;
