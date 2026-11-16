import { LiveSession } from '../src/live.ts';
import { renderChain } from '../src/render.ts';
import { installNetworkGuard, MemoryRing, createTrace } from '@toolpa/trace';

const ring = new MemoryRing(128);
const { trace } = createTrace({ ring });
installNetworkGuard({
  allow: (url) => url.startsWith('blob:') || url.startsWith(location.origin),
  trace,
});

const chain = {
  kind: 'chain',
  version: 1,
  sampleRate: 44100,
  source: { type: 'sine', frequencyHz: 440 },
  effect: { type: 'tone', cutoffHz: 8000, q: 0.7071067811865476, gain: 0.8 },
};

const session = new LiveSession(trace);
let started: { hash: string; state: string; sampleRate: number; baseLatencyMs: number; running: boolean } | null = null;
let startError: string | null = null;

const api = {
  snapshot: () => ring.snapshot(),
  async play() {
    const context = new AudioContext({ sampleRate: chain.sampleRate });
    const started = await session.start({ context, chain });
    return { ...started, state: context.state, sampleRate: context.sampleRate };
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
  async stop() {
    return session.stop();
  },
  async offlineHash() {
    const rendered = await renderChain({ chain, durationSeconds: 0.1 });
    return { hash: rendered.hash, wavSha256: rendered.wavSha256 };
  },
  forceStall() {
    const first = session.noteClock(300, 0);
    const second = session.noteClock(300, 0);
    const stalls = ring.snapshot().filter((record) => record.name === 'live.stall').length;
    return { first, second, stalls };
  },
  renderInWorker(next: unknown, durationSeconds: number) {
    return new Promise<{ hash?: string; wavSha256?: string; frames?: number; error?: string }>((resolve) => {
      const worker = new Worker(new URL('/worker.js', location.href), { type: 'module' });
      const timer = setTimeout(() => {
        worker.terminate();
        resolve({ error: 'worker timed out' });
      }, 20_000);
      worker.onmessage = (event: MessageEvent<{ hash?: string; wavSha256?: string; frames?: number; error?: string }>) => {
        clearTimeout(timer);
        worker.terminate();
        resolve(event.data);
      };
      worker.onerror = (error) => {
        clearTimeout(timer);
        worker.terminate();
        resolve({ error: error.message });
      };
      worker.postMessage({ id: 1, chain: next, durationSeconds });
    });
  },
  started: () => started,
  startError: () => startError,
};

document.getElementById('play')?.addEventListener('click', () => {
  void api.play().then(
    (value) => {
      started = value;
    },
    (error: unknown) => {
      startError = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    },
  );
});

declare global {
  interface Window {
    __toolpaLive: typeof api;
  }
}

window.__toolpaLive = api;
