# Slice 13 — Web MIDI

Depends on slice 3.

## Goal

Web MIDI lists devices, delivers notes, reports hot-plug, and counts clock. Tests keep a fake port.

## Steps

1. `requestMidiAccess` uses an injected request or `navigator.requestMIDIAccess`.
2. List input names. Attach one input. Record `onstatechange`.
3. Clock in counts `0xF8`. Clock out writes 24 ticks per quarter.
4. Leave `openHardwarePort` throwing so tests do not prompt.

## Telemetry

`midi.access` and `midi.hotplug`.

## Tests

- Fake port name, 24 ticks, one note.
- Node without Web MIDI throws `MIDI_UNAVAILABLE`.
- Browsers agree and do not call the real permission API.

## Done when

`pnpm slice:gate` is green.
