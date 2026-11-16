export class InputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'InputError';
  }
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

  peak(id: string): number {
    let peak = 0;
    for (const sample of this.read(id)) peak = Math.max(peak, Math.abs(sample));
    return peak;
  }
}

export function openMicrophone(): never {
  throw new InputError('MIC_FOLLOWUP', 'MIC_FOLLOWUP: microphone capture is a follow-up');
}
