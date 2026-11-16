export class TransportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'TransportError';
  }
}

export function secondsPerBeat(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) {
    throw new TransportError('TEMPO_RANGE', 'TEMPO_RANGE: bpm must be from 20 to 300');
  }
  return 60 / bpm;
}

export function beatToSeconds(beats: number, bpm: number): number {
  if (!Number.isFinite(beats) || beats < 0 || beats > 4096) {
    throw new TransportError('TEMPO_RANGE', 'TEMPO_RANGE: beats must be from 0 to 4096');
  }
  return beats * secondsPerBeat(bpm);
}
