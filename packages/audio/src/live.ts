import WebRenderer from '@elemaudio/web-renderer';
import type { Trace } from '@toolpa/trace';
import { measure } from './meter.ts';
import { prepareChain, type SampleBuffer } from './render.ts';

export function stalled(state: string, wallSeconds: number, audioSeconds: number): boolean {
  return state === 'running' && wallSeconds > 0.25 && audioSeconds < wallSeconds * 0.25;
}

export interface LiveSnapshot {
  hash: string;
  baseLatencyMs: number;
  outputLatencyMs: number;
  underruns: number;
  peak: number;
  level: number;
  rms: number;
  running: boolean;
}

export class LiveSession {
  private renderer: WebRenderer | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private watch: ReturnType<typeof setInterval> | null = null;
  private underruns = 0;
  private peak = 0;
  private level = 0;
  private rms = 0;
  private lastAudio = 0;
  private lastWall = 0;
  hash = '';

  constructor(private readonly trace?: Trace) {}

  async start(input: {
    context: AudioContext;
    chain: unknown;
    samples?: ReadonlyMap<string, SampleBuffer>;
  }): Promise<LiveSnapshot> {
    const prepared = await prepareChain(input, this.trace);
    this.hash = prepared.hash;
    const renderer = new WebRenderer();
    const worklet = await renderer.initialize(input.context, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const analyser = input.context.createAnalyser();
    analyser.fftSize = 2048;
    worklet.connect(analyser);
    analyser.connect(input.context.destination);
    if (prepared.vfs) await renderer.updateVirtualFileSystem(prepared.vfs);
    await renderer.render(prepared.node);
    if (input.context.state !== 'running') await input.context.resume();
    this.renderer = renderer;
    this.context = input.context;
    this.analyser = analyser;
    this.lastAudio = input.context.currentTime;
    this.lastWall = performance.now();
    this.watch = setInterval(() => this.poll(), 100);
    const snapshot = this.snapshot();
    this.trace?.event('playback.started', {
      hash: this.hash,
      baseLatencyMs: snapshot.baseLatencyMs,
      outputLatencyMs: snapshot.outputLatencyMs,
      sampleRate: input.context.sampleRate,
    });
    return snapshot;
  }

  poll(): void {
    const context = this.context;
    const analyser = this.analyser;
    if (!context || !analyser) return;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    const meter = measure(data);
    this.level = meter.peak;
    this.peak = Math.max(this.peak, meter.peak);
    this.rms = meter.rms;
    const now = performance.now();
    const wallSeconds = (now - this.lastWall) / 1000;
    const audioSeconds = context.currentTime - this.lastAudio;
    if (stalled(context.state, wallSeconds, audioSeconds)) this.underruns += 1;
    this.lastWall = now;
    this.lastAudio = context.currentTime;
  }

  snapshot(): LiveSnapshot {
    const context = this.context;
    const base = context?.baseLatency ?? 0;
    const output = context?.outputLatency ?? base;
    return {
      hash: this.hash,
      baseLatencyMs: base * 1000,
      outputLatencyMs: output * 1000,
      underruns: this.underruns,
      peak: this.peak,
      level: this.level,
      rms: this.rms,
      running: context?.state === 'running',
    };
  }

  async stop(): Promise<LiveSnapshot> {
    if (this.watch !== null) clearInterval(this.watch);
    this.watch = null;
    this.poll();
    const snapshot = this.snapshot();
    this.trace?.event('playback.stats', {
      hash: snapshot.hash,
      baseLatencyMs: snapshot.baseLatencyMs,
      outputLatencyMs: snapshot.outputLatencyMs,
      underruns: snapshot.underruns,
      peak: snapshot.peak,
    });
    this.trace?.metric('playback.baseLatency', snapshot.baseLatencyMs, 'ms', { hash: snapshot.hash });
    this.trace?.metric('playback.outputLatency', snapshot.outputLatencyMs, 'ms', { hash: snapshot.hash });
    this.trace?.metric('playback.underruns', snapshot.underruns, 'count', { hash: snapshot.hash });
    this.trace?.event('playback.stopped', { hash: snapshot.hash, underruns: snapshot.underruns });
    this.analyser?.disconnect();
    void this.renderer;
    this.renderer = null;
    this.context = null;
    this.analyser = null;
    return snapshot;
  }
}
