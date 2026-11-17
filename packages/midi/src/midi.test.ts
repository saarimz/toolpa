import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import {
  MidiError,
  fakePort,
  filterChannel,
  keyboardNote,
  midiSelfCheck,
  openHardwarePort,
  parseMidi,
  readPort,
  scaleVelocity,
  transpose,
} from './midi.ts';

describe('midi bytes and devices', () => {
  it('parses a note on, a note off, and a control change', () => {
    const events = parseMidi(Uint8Array.of(0x90, 60, 100, 0x80, 60, 0, 0xb0, 7, 64));
    expect(events).toEqual([
      { type: 'note-on', channel: 0, midi: 60, velocity: 100 },
      { type: 'note-off', channel: 0, midi: 60, velocity: 0 },
      { type: 'cc', channel: 0, controller: 7, value: 64 },
    ]);
  });

  it('treats a note on with velocity 0 as a note off', () => {
    expect(parseMidi(Uint8Array.of(0x90, 60, 0))[0]?.type).toBe('note-off');
  });

  it('rejects running status and an unknown status', () => {
    expect(() => parseMidi(Uint8Array.of(60, 100))).toThrow(MidiError);
    expect(() => parseMidi(Uint8Array.of(60, 100))).toThrow(/MIDI_RUNNING_STATUS/);
    expect(() => parseMidi(Uint8Array.of(0xf0, 1, 2))).toThrow(/MIDI_STATUS/);
  });

  it('transposes notes, scales velocity, and filters a channel', () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const events = parseMidi(Uint8Array.of(0x90, 60, 100, 0x91, 62, 40), trace);
    expect(transpose(events, 2, trace)[0]).toMatchObject({ midi: 62 });
    expect(scaleVelocity(events, 0.5, trace)[0]).toMatchObject({ velocity: 50 });
    expect(filterChannel(events, 0, trace)).toHaveLength(1);
    expect(keyboardNote('a')).toBe(60);
    expect(keyboardNote('s')).toBe(62);
    expect(keyboardNote('z')).toBeNull();
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('midi.parse');
    expect(names).toContain('midi.effect');
  });

  it('reads a fake port and refuses a hardware port', async () => {
    const port = fakePort('fake', [Uint8Array.of(0x90, 60, 100)]);
    const events = await readPort(port);
    expect(events[0]).toMatchObject({ type: 'note-on', midi: 60 });
    expect(() => openHardwarePort()).toThrow(/MIDI_HARDWARE_FOLLOWUP/);
  });

  it('matches the browser self-check', () => {
    expect(midiSelfCheck()).toEqual({ events: 3, transposed: 62, key: 60, channel: 3 });
  });
});
