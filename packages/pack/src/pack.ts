import { unzipSync, zipSync } from 'fflate';
import { renderInstrument, renderVoiceSum } from '@toolpa/audio';
import type { Trace } from '@toolpa/trace';

export class PackError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PackError';
  }
}

export interface SmfNote {
  midi: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
}

function vlq(value: number): number[] {
  if (!Number.isInteger(value) || value < 0 || value > 0x0fffffff) {
    throw new PackError('SMF_TICK', 'SMF_TICK: a tick must be an integer from 0 to 268435455');
  }
  const bytes = [value & 0x7f];
  let rest = value >> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>= 7;
  }
  return bytes;
}

export function writeSmf(notes: readonly SmfNote[], trace?: Trace): Uint8Array {
  if (notes.length < 1 || notes.length > 64) throw new PackError('SMF_NOTES', 'SMF_NOTES: write 1 to 64 notes');
  const timed: Array<{ tick: number; bytes: number[] }> = [
    { tick: 0, bytes: [0xff, 0x51, 0x03, 0x07, 0xa1, 0x20] },
  ];
  for (const note of notes) {
    if (!Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127) throw new PackError('SMF_NOTE', 'SMF_NOTE: midi is out of range');
    if (!Number.isInteger(note.velocity) || note.velocity < 1 || note.velocity > 127) {
      throw new PackError('SMF_NOTE', 'SMF_NOTE: velocity is out of range');
    }
    if (!Number.isInteger(note.durationTicks) || note.durationTicks < 1) throw new PackError('SMF_NOTE', 'SMF_NOTE: duration is empty');
    timed.push({ tick: note.startTick, bytes: [0x90, note.midi, note.velocity] });
    timed.push({ tick: note.startTick + note.durationTicks, bytes: [0x80, note.midi, 0x00] });
  }
  timed.sort((left, right) => left.tick - right.tick);
  let last = 0;
  const track: number[] = [];
  for (const event of timed) {
    if (event.tick < last) throw new PackError('SMF_TICK', 'SMF_TICK: ticks went backwards');
    track.push(...vlq(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);
  const header = [0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x03, 0xc0];
  const length = track.length;
  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b,
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
  ];
  const bytes = Uint8Array.from([...header, ...trackHeader, ...track]);
  trace?.event('export.smf', { bytes: bytes.byteLength, notes: notes.length, ppq: 960 });
  return bytes;
}

export function writeSfz(sha256: string, midi: number): string {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new PackError('SFZ_SAMPLE', 'SFZ_SAMPLE: sha256 must be 64 lowercase hex characters');
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new PackError('SFZ_SAMPLE', 'SFZ_SAMPLE: midi is out of range');
  return `<group>\n<region>\nsample=samples/${sha256}.wav\nlokey=${midi}\nhikey=${midi}\npitch_keycenter=${midi}\n`;
}

export function writeSamplePack(sha256: string, midi: number, wav: Uint8Array): Uint8Array {
  const sfz = new TextEncoder().encode(writeSfz(sha256, midi));
  return zipSync({
    'instrument.sfz': sfz,
    [`samples/${sha256}.wav`]: wav,
  });
}

export function readSamplePack(bytes: Uint8Array): string[] {
  return Object.keys(unzipSync(bytes)).sort();
}

const stemInstrument = {
  kind: 'instrument',
  version: 1,
  sampleRate: 44100,
  voice: { type: 'sine', attackSeconds: 0.005, decaySeconds: 0.02, sustain: 0.8, releaseSeconds: 0.02 },
  maxVoices: 2,
  notes: [{ midi: 60, startSeconds: 0, durationSeconds: 0.2, velocity: 100 }],
  effect: { type: 'tone', cutoffHz: 800, q: 0.7071067811865476, gain: 0.4 },
};

export async function renderStems(trace?: Trace) {
  const dry = await renderVoiceSum({ instrument: stemInstrument, durationSeconds: 0.3 }, trace);
  const wet = await renderInstrument({ instrument: stemInstrument, durationSeconds: 0.3 }, trace);
  trace?.event('export.stem', { hash: wet.hash, stem: 'wet', frames: wet.pcm.length });
  return { dry, wet };
}

export function smfSelfCheck(): { bytes: number; header: string } {
  const bytes = writeSmf([{ midi: 60, startTick: 0, durationTicks: 960, velocity: 100 }]);
  return { bytes: bytes.byteLength, header: [...bytes.subarray(0, 4)].map((byte) => String.fromCharCode(byte)).join('') };
}
