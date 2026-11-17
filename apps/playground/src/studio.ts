import { DeviceRegistry, composeRack, type DeviceDef } from '@toolpa/devices';
import { readSamplePack, renderStems, writeSamplePack, writeSfz, writeSmf, type SmfNote } from '@toolpa/pack';
import type { Trace } from '@toolpa/trace';

export const STUDIO_DEVICES: readonly DeviceDef[] = [
  { id: 'keys', role: 'midi', title: 'Keys' },
  { id: 'sine', role: 'instrument', title: 'Sine' },
  {
    id: 'lowpass',
    role: 'effect',
    title: 'Lowpass',
    effect: { type: 'tone', cutoffHz: 1200, q: 0.7071067811865476, gain: 0.25 },
  },
];

export const ROLL_STEPS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
export const ROLL_MIDIS = [60, 62, 64, 65, 67, 69, 71, 72] as const;

export function cellKey(step: number, midi: number): string {
  return `${step}:${midi}`;
}

export function notesFromRoll(active: readonly string[]): SmfNote[] {
  return active
    .map((key) => {
      const [step, midi] = key.split(':').map((part) => Number(part));
      return { midi: midi ?? Number.NaN, startTick: (step ?? Number.NaN) * 480, durationTicks: 480, velocity: 100 };
    })
    .filter((note) => Number.isInteger(note.midi) && note.midi >= 0 && note.midi <= 127 && Number.isInteger(note.startTick) && note.startTick >= 0)
    .sort((left, right) => left.startTick - right.startTick || left.midi - right.midi);
}

export function createStudioRegistry(trace?: Trace): DeviceRegistry {
  const registry = new DeviceRegistry();
  for (const device of STUDIO_DEVICES) registry.register(device, trace);
  return registry;
}

export async function composeStudio(ids: readonly string[], trace?: Trace): Promise<{ hash: string } | { error: string }> {
  try {
    const rack = await composeRack(createStudioRegistry(trace), ids, trace);
    return { hash: rack.hash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = message.split(':')[0] ?? 'RACK';
    return { error: code };
  }
}

export async function describeExport(
  kind: 'midi' | 'sfz' | 'stems' | 'pack',
  notes: readonly SmfNote[],
  sampleSha: string,
  trace?: Trace,
): Promise<string> {
  if (kind === 'midi') {
    const bytes = writeSmf(notes, trace);
    const header = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
    return `MIDI ${header} ${bytes.byteLength}`;
  }
  if (kind === 'sfz') {
    const text = writeSfz(sampleSha, notes[0]?.midi ?? 60);
    trace?.event('export.sfz', { bytes: text.length, midi: notes[0]?.midi ?? 60 });
    return text.split('\n').find((line) => line.startsWith('sample=')) ?? text;
  }
  const stems = await renderStems(trace);
  if (kind === 'stems') return `stems ${stems.wet.hash}`;
  const pack = writeSamplePack(stems.wet.wavSha256, notes[0]?.midi ?? 60, stems.wet.wav);
  const names = readSamplePack(pack);
  trace?.event('export.pack', { bytes: pack.byteLength, files: names.length });
  return `pack ${names.join(' ')}`;
}
