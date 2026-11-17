import type { Trace } from '@toolpa/trace';

export type MidiEvent =
  | { type: 'note-on'; channel: number; midi: number; velocity: number }
  | { type: 'note-off'; channel: number; midi: number; velocity: number }
  | { type: 'cc'; channel: number; controller: number; value: number };

export class MidiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MidiError';
  }
}

export interface MidiPort {
  name: string;
  pull(): Promise<Uint8Array>;
}

const KEYS: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
};

function dataByte(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 127) {
    throw new MidiError('MIDI_DATA', `MIDI_DATA: ${label} must be 0 to 127`);
  }
  return value;
}

export function parseMidi(bytes: Uint8Array, trace?: Trace): MidiEvent[] {
  const events: MidiEvent[] = [];
  let index = 0;
  while (index < bytes.length) {
    const status = bytes[index] ?? 0;
    if (status < 0x80) throw new MidiError('MIDI_RUNNING_STATUS', 'MIDI_RUNNING_STATUS: a data byte arrived without a status');
    const kind = status & 0xf0;
    const channel = status & 0x0f;
    if (kind !== 0x80 && kind !== 0x90 && kind !== 0xb0) {
      throw new MidiError('MIDI_STATUS', `MIDI_STATUS: 0x${status.toString(16)} is not a note or control change`);
    }
    const first = bytes[index + 1];
    const second = bytes[index + 2];
    if (first === undefined || second === undefined) throw new MidiError('MIDI_TRUNCATED', 'MIDI_TRUNCATED: a message is missing data bytes');
    if (kind === 0xb0) {
      events.push({
        type: 'cc',
        channel,
        controller: dataByte(first, 'controller'),
        value: dataByte(second, 'value'),
      });
    } else {
      const midi = dataByte(first, 'midi');
      const velocity = dataByte(second, 'velocity');
      const noteOff = kind === 0x80 || velocity === 0;
      events.push({
        type: noteOff ? 'note-off' : 'note-on',
        channel,
        midi,
        velocity: noteOff ? velocity : velocity,
      });
    }
    index += 3;
  }
  trace?.event('midi.parse', { bytes: bytes.byteLength, events: events.length });
  return events;
}

export function keyboardNote(key: string): number | null {
  const offset = KEYS[key.toLowerCase()];
  if (offset === undefined) return null;
  return 60 + offset;
}

export function transpose(events: readonly MidiEvent[], semitones: number, trace?: Trace): MidiEvent[] {
  if (!Number.isInteger(semitones) || semitones < -48 || semitones > 48) {
    throw new MidiError('MIDI_RANGE', 'MIDI_RANGE: transpose must be an integer from -48 to 48');
  }
  const next = events.map((event) => {
    if (event.type === 'cc') return event;
    const midi = event.midi + semitones;
    if (midi < 0 || midi > 127) throw new MidiError('MIDI_RANGE', `MIDI_RANGE: ${event.midi} shifted by ${semitones} leaves 0 to 127`);
    return { ...event, midi };
  });
  trace?.event('midi.effect', { effect: 'transpose', events: next.length, semitones });
  return next;
}

export function scaleVelocity(events: readonly MidiEvent[], factor: number, trace?: Trace): MidiEvent[] {
  if (!Number.isFinite(factor) || factor <= 0 || factor > 4) {
    throw new MidiError('MIDI_RANGE', 'MIDI_RANGE: velocity scale must be greater than 0 and at most 4');
  }
  const next = events.map((event) => {
    if (event.type !== 'note-on') return event;
    return { ...event, velocity: Math.max(1, Math.min(127, Math.round(event.velocity * factor))) };
  });
  trace?.event('midi.effect', { effect: 'velocity', events: next.length, factor });
  return next;
}

export function filterChannel(events: readonly MidiEvent[], channel: number, trace?: Trace): MidiEvent[] {
  if (!Number.isInteger(channel) || channel < 0 || channel > 15) {
    throw new MidiError('MIDI_RANGE', 'MIDI_RANGE: channel must be an integer from 0 to 15');
  }
  const next = events.filter((event) => event.channel === channel);
  trace?.event('midi.effect', { effect: 'channel', events: next.length, channel });
  return next;
}

export function fakePort(name: string, packets: readonly Uint8Array[]): MidiPort {
  const queue = [...packets];
  return {
    name,
    async pull() {
      const next = queue.shift();
      if (!next) throw new MidiError('MIDI_EMPTY', 'MIDI_EMPTY: the port has no further messages');
      return next;
    },
  };
}

export async function readPort(port: MidiPort, trace?: Trace): Promise<MidiEvent[]> {
  return parseMidi(await port.pull(), trace);
}

export function openHardwarePort(): never {
  throw new MidiError('MIDI_HARDWARE_FOLLOWUP', 'MIDI_HARDWARE_FOLLOWUP: a physical Web MIDI port is not opened in this slice');
}

export function midiSelfCheck(): { events: number; transposed: number; key: number; channel: number } {
  const events = parseMidi(Uint8Array.of(0x90, 60, 100, 0x80, 60, 0, 0xb0, 1, 64));
  const shifted = transpose(events, 2);
  const keyed = keyboardNote('a');
  const filtered = filterChannel(events, 0);
  return {
    events: events.length,
    transposed: shifted[0]?.type === 'note-on' ? shifted[0].midi : -1,
    key: keyed ?? -1,
    channel: filtered.length,
  };
}
