import type { Trace } from '@toolpa/trace';

export class InputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'InputError';
  }
}

export interface MicCapture {
  sampleRate: number;
  outputLatency: number;
  inputLatency: number;
  frames: Float32Array;
}

export interface MicSource {
  getUserMedia(constraints: { audio: true }): Promise<MicCapture>;
}

export class InputBus {
  private readonly channels = new Map<string, Float32Array>();

  register(id: string, frames = 128): void {
    if (!/^[a-z0-9-]{1,32}$/.test(id)) throw new InputError('INPUT_ID', 'INPUT_ID: a bus id is 1 to 32 lowercase letters, digits, or hyphens');
    if (this.channels.has(id)) throw new InputError('INPUT_DUPLICATE', 'INPUT_DUPLICATE: that bus is already registered');
    if (!Number.isInteger(frames) || frames < 1 || frames > 8192) {
      throw new InputError('INPUT_FRAMES', 'INPUT_FRAMES: a bus holds 1 to 8192 frames');
    }
    this.channels.set(id, new Float32Array(frames));
  }

  read(id: string): Float32Array {
    const channel = this.channels.get(id);
    if (!channel) throw new InputError('INPUT_UNKNOWN', 'INPUT_UNKNOWN: that bus is not registered');
    return channel;
  }

  write(id: string, frames: Float32Array): void {
    const channel = this.read(id);
    if (frames.length !== channel.length) throw new InputError('INPUT_FRAMES', 'INPUT_FRAMES: the capture length must match the bus');
    for (let index = 0; index < frames.length; index += 1) {
      const sample = frames[index] ?? Number.NaN;
      if (!Number.isFinite(sample)) throw new InputError('INPUT_NAN', 'INPUT_NAN: a capture sample must be finite');
      channel[index] = sample;
    }
  }

  peak(id: string): number {
    let peak = 0;
    for (const sample of this.read(id)) peak = Math.max(peak, Math.abs(sample));
    return peak;
  }
}

export function latencyFrames(sampleRate: number, outputLatency: number, inputLatency: number): number {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new InputError('INPUT_RATE', 'INPUT_RATE: sample rate must be from 8000 to 192000');
  }
  if (!Number.isFinite(outputLatency) || !Number.isFinite(inputLatency) || outputLatency < 0 || inputLatency < 0) {
    throw new InputError('INPUT_LATENCY', 'INPUT_LATENCY: latencies must be finite and at least 0');
  }
  return Math.round(Math.max(0, outputLatency - inputLatency) * sampleRate);
}

export function compensate(frames: Float32Array, delay: number): Float32Array {
  if (!Number.isInteger(delay) || delay < 0) throw new InputError('INPUT_LATENCY', 'INPUT_LATENCY: delay frames must be a non-negative integer');
  const delayed = new Float32Array(frames.length);
  for (let index = delay; index < frames.length; index += 1) delayed[index] = frames[index - delay] ?? 0;
  return delayed;
}

function browserMic(): MicSource['getUserMedia'] | undefined {
  const media = (globalThis as { navigator?: { mediaDevices?: { getUserMedia?: MicSource['getUserMedia'] } } }).navigator?.mediaDevices;
  return media?.getUserMedia?.bind(media);
}

export async function captureMicrophone(
  options: { live?: boolean; monitor?: boolean; getUserMedia?: MicSource['getUserMedia']; trace?: Trace } = {},
): Promise<{ bus: InputBus; delayFrames: number; monitorPeak: number; live: boolean }> {
  const monitor = options.monitor === true;
  if (!options.live) {
    const bus = new InputBus();
    bus.register('mic');
    options.trace?.event('input.open', { live: false, monitor: monitor ? 1 : 0, delay: 0 });
    return { bus, delayFrames: 0, monitorPeak: 0, live: false };
  }
  const getUserMedia = options.getUserMedia ?? browserMic();
  if (!getUserMedia) throw new InputError('MIC_UNAVAILABLE', 'MIC_UNAVAILABLE: this runtime has no microphone');
  const capture = await getUserMedia({ audio: true });
  for (const sample of capture.frames) {
    if (!Number.isFinite(sample)) throw new InputError('INPUT_NAN', 'INPUT_NAN: a capture sample must be finite');
  }
  const delayFrames = latencyFrames(capture.sampleRate, capture.outputLatency, capture.inputLatency);
  const bus = new InputBus();
  bus.register('mic', capture.frames.length);
  bus.write('mic', compensate(capture.frames, Math.min(delayFrames, capture.frames.length)));
  const heard = monitor ? bus.peak('mic') : 0;
  options.trace?.event('input.open', { live: true, monitor: monitor ? 1 : 0, delay: delayFrames });
  return { bus, delayFrames, monitorPeak: heard, live: true };
}

export function openMicrophone(): never {
  throw new InputError('MIC_FOLLOWUP', 'MIC_FOLLOWUP: microphone capture is a follow-up');
}

export async function inputSelfCheck(): Promise<{ silent: number; delay: number; monitor: number; bus: number }> {
  const silent = await captureMicrophone({ live: false });
  const live = await captureMicrophone({
    live: true,
    monitor: false,
    getUserMedia: async () => ({
      sampleRate: 44100,
      outputLatency: 10 / 44100,
      inputLatency: 0,
      frames: new Float32Array(128).fill(0.25),
    }),
  });
  return { silent: silent.bus.peak('mic'), delay: live.delayFrames, monitor: live.monitorPeak, bus: live.bus.peak('mic') };
}
