import type { Trace } from '@toolpa/trace';
import { MidiError, parseMidi, type MidiEvent } from './midi.ts';

export interface MidiInputLike {
  id: string;
  name: string;
  state: 'connected' | 'disconnected';
  onmidimessage: ((event: { data: Uint8Array }) => void) | null;
}

export interface MidiOutputLike {
  id: string;
  name: string;
  state: 'connected' | 'disconnected';
  send: (bytes: Uint8Array) => void;
}

export interface MidiAccessLike {
  inputs: ReadonlyMap<string, MidiInputLike>;
  outputs: ReadonlyMap<string, MidiOutputLike>;
  onstatechange: ((event: { port: { id: string; name: string; state: string } }) => void) | null;
}

export function listInputs(access: MidiAccessLike): string[] {
  return [...access.inputs.values()].map((input) => input.name).sort();
}

export function attachInput(access: MidiAccessLike, id: string, onEvent: (event: MidiEvent) => void, trace?: Trace): () => void {
  const input = access.inputs.get(id);
  if (!input || input.state !== 'connected') throw new MidiError('MIDI_PORT', 'MIDI_PORT: that input is not connected');
  input.onmidimessage = (message) => {
    for (const event of parseMidi(message.data, trace)) onEvent(event);
  };
  const previous = access.onstatechange;
  access.onstatechange = (stateEvent) => {
    previous?.(stateEvent);
    if (stateEvent.port.id === id && stateEvent.port.state === 'disconnected') {
      trace?.event('midi.hotplug', { name: stateEvent.port.name, state: 'disconnected' });
    }
    if (stateEvent.port.state === 'connected') trace?.event('midi.hotplug', { name: stateEvent.port.name, state: 'connected' });
  };
  trace?.event('midi.access', { inputs: access.inputs.size, name: input.name });
  return () => {
    input.onmidimessage = null;
  };
}

export function countClock(bytes: Uint8Array): { ticks: number; quarters: number } {
  let ticks = 0;
  for (const byte of bytes) if (byte === 0xf8) ticks += 1;
  return { ticks, quarters: ticks / 24 };
}

export function clockBytes(quarters: number): Uint8Array {
  if (!Number.isInteger(quarters) || quarters < 1 || quarters > 16) {
    throw new MidiError('MIDI_CLOCK', 'MIDI_CLOCK: quarters must be an integer from 1 to 16');
  }
  return new Uint8Array(quarters * 24).fill(0xf8);
}

export interface MidiRequest {
  requestMIDIAccess: () => Promise<MidiAccessLike>;
}

export async function requestMidiAccess(source?: MidiRequest, trace?: Trace): Promise<MidiAccessLike> {
  const request = source?.requestMIDIAccess ?? readNavigatorMidi();
  if (!request) throw new MidiError('MIDI_UNAVAILABLE', 'MIDI_UNAVAILABLE: this browser has no Web MIDI');
  const access = await request();
  trace?.event('midi.access', { inputs: access.inputs.size, name: listInputs(access)[0] ?? '' });
  return access;
}

function readNavigatorMidi(): MidiRequest['requestMIDIAccess'] | undefined {
  const nav = (globalThis as { navigator?: { requestMIDIAccess?: () => Promise<MidiAccessLike> } }).navigator;
  return nav?.requestMIDIAccess?.bind(nav);
}

export function webMidiSelfCheck(): { names: string[]; ticks: number; quarters: number; hotplug: string } {
  const input: MidiInputLike = { id: 'in', name: 'Fake Keyboard', state: 'connected', onmidimessage: null };
  const access: MidiAccessLike = {
    inputs: new Map([['in', input]]),
    outputs: new Map(),
    onstatechange: null,
  };
  const names = listInputs(access);
  let notes = 0;
  attachInput(access, 'in', (event) => {
    if (event.type === 'note-on') notes += 1;
  });
  input.onmidimessage?.({ data: Uint8Array.of(0x90, 60, 100) });
  access.onstatechange?.({ port: { id: 'in', name: input.name, state: 'disconnected' } });
  const clock = countClock(clockBytes(1));
  return { names, ticks: clock.ticks, quarters: clock.quarters, hotplug: notes === 1 ? 'note' : 'miss' };
}
