import WebRenderer from '@elemaudio/web-renderer';
import { hashChain } from '@toolpa/graph';
import type { Trace } from '@toolpa/trace';
import { measure } from './meter.ts';
import { prepareChain, type SampleBuffer } from './render.ts';

export function stalled(state: string, wallSeconds: number, audioSeconds: number): boolean {
  return state === 'running' && wallSeconds > 0.25 && audioSeconds < wallSeconds * 0.25;
}

export function clockBudgetMs(sampleRate: number): number {
  return (128 / sampleRate) * 1000 + 20;
}

export function clockDriftStalled(sampleRate: number, wallMs: number, audioMs: number): boolean {
  const budget = clockBudgetMs(sampleRate);
  return wallMs > budget && wallMs - audioMs > budget;
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
  private stallEmitted = false;
  hash = '';

  constructor(private readonly trace?: Trace) {}

  async start(input: {
    context: AudioContext;
    chain: unknown;
    samples?: ReadonlyMap<string, SampleBuffer>;
  }): Promise<LiveSnapshot> {
    const prepared = await prepareChain(input, this.trace);
    return this.begin(input.context, prepared.node, prepared.hash, prepared.vfs);
  }

  async startNode(input: {
    context: AudioContext;
    node: Awaited<ReturnType<typeof prepareChain>>['node'];
    hash: string;
    vfs?: Record<string, Float32Array>;
  }): Promise<LiveSnapshot> {
    return this.begin(input.context, input.node, input.hash, input.vfs);
  }

  async update(node: Awaited<ReturnType<typeof prepareChain>>['node'], hash: string, vfs?: Record<string, Float32Array>): Promise<void> {
    if (!this.renderer) return;
    if (vfs) await this.renderer.updateVirtualFileSystem(vfs);
    await this.renderer.render(node);
    this.hash = hash;
    this.trace?.event('live.swap', { hash, noop: false });
  }

  private async begin(
    context: AudioContext,
    node: Awaited<ReturnType<typeof prepareChain>>['node'],
    hash: string,
    vfs?: Record<string, Float32Array>,
  ): Promise<LiveSnapshot> {
    this.hash = hash;
    const renderer = new WebRenderer();
    const worklet = await renderer.initialize(context, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    worklet.connect(analyser);
    analyser.connect(context.destination);
    if (vfs) await renderer.updateVirtualFileSystem(vfs);
    await renderer.render(node);
    if (context.state !== 'running') await context.resume();
    this.renderer = renderer;
    this.context = context;
    this.analyser = analyser;
    this.lastAudio = context.currentTime;
    this.lastWall = performance.now();
    this.watch = setInterval(() => this.poll(), 100);
    const snapshot = this.snapshot();
    this.trace?.event('engine.init', { sampleRate: context.sampleRate, hash: this.hash });
    this.trace?.event('ctx.state', { state: context.state });
    this.trace?.event('ctx.latency', {
      baseLatencyMs: snapshot.baseLatencyMs,
      outputLatencyMs: snapshot.outputLatencyMs,
      sampleRate: context.sampleRate,
    });
    this.trace?.event('live.load', { hash: this.hash });
    this.trace?.event('playback.started', {
      hash: this.hash,
      baseLatencyMs: snapshot.baseLatencyMs,
      outputLatencyMs: snapshot.outputLatencyMs,
      sampleRate: context.sampleRate,
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
    if (wallSeconds * 1000 >= 250) this.noteClock(wallSeconds * 1000, audioSeconds * 1000, context.sampleRate);
    this.lastWall = now;
    this.lastAudio = context.currentTime;
  }

  noteClock(wallMs: number, audioMs: number, sampleRate = this.context?.sampleRate ?? 48_000): boolean {
    if (this.stallEmitted || !clockDriftStalled(sampleRate, wallMs, audioMs)) return false;
    this.stallEmitted = true;
    this.trace?.event('live.stall', {
      expectedMs: wallMs,
      observedMs: audioMs,
      driftMs: wallMs - audioMs,
    });
    return true;
  }

  async considerSwap(chain: unknown): Promise<boolean> {
    const next = await hashChain(chain);
    if (!this.hash || next.hash !== this.hash) return false;
    this.trace?.event('live.swap', { hash: this.hash, noop: true });
    return true;
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
    this.trace?.event('live.playbackStats', {
      hash: snapshot.hash,
      underruns: snapshot.underruns,
      baseLatencyMs: snapshot.baseLatencyMs,
      outputLatencyMs: snapshot.outputLatencyMs,
    });
    this.analyser?.disconnect();
    void this.renderer;
    this.renderer = null;
    this.context = null;
    this.analyser = null;
    return snapshot;
  }
}
