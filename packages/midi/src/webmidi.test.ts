import { describe, expect, it } from 'vitest';
import { createTrace } from '@toolpa/trace';
import { MidiError, openHardwarePort } from './midi.ts';
import { clockBytes, countClock, requestMidiAccess, webMidiSelfCheck } from './webmidi.ts';

describe('Web MIDI', () => {
  it('lists a fake port, counts a clock, and keeps the hardware throw', async () => {
    const lines: string[] = [];
    const { trace } = createTrace({ ndjson: (line) => lines.push(line) });
    const check = webMidiSelfCheck();
    expect(check.names).toEqual(['Fake Keyboard']);
    expect(check.ticks).toBe(24);
    expect(check.quarters).toBe(1);
    expect(check.hotplug).toBe('note');
    expect(countClock(clockBytes(2)).ticks).toBe(48);
    const access = await requestMidiAccess(
      {
        requestMIDIAccess: async () => ({
          inputs: new Map([['a', { id: 'a', name: 'Zed', state: 'connected', onmidimessage: null }], ['b', { id: 'b', name: 'Aye', state: 'connected', onmidimessage: null }]]),
          outputs: new Map(),
          onstatechange: null,
        }),
      },
      trace,
    );
    expect([...access.inputs.keys()]).toEqual(['a', 'b']);
    expect(() => openHardwarePort()).toThrow(MidiError);
    await expect(requestMidiAccess(undefined)).rejects.toThrow(/MIDI_UNAVAILABLE/);
    const names = lines.map((line) => JSON.parse(line.trim()) as { name: string }).map((record) => record.name);
    expect(names).toContain('midi.access');
  });
});
