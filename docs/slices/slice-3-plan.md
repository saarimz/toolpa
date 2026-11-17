# Slice 3 — MIDI input and MIDI-to-MIDI devices

Depends on slice 2. No audio graph changes.

## Goal

MIDI bytes and a computer-keyboard key become note events. Transpose, velocity scale, and a channel filter transform that list. A physical Web MIDI port stays behind `MidiPort`.

## Steps

1. Parse note on, note off, and control change. Velocity 0 is note off. A data byte without a status throws `MIDI_RUNNING_STATUS`.
2. Map the piano row (`a` is C4, MIDI 60).
3. Apply transpose, velocity scale, and channel filter as pure event lists.
4. Read those bytes through a `MidiPort`. `openHardwarePort` throws `MIDI_HARDWARE_FOLLOWUP`.
5. Run the same parser in Chromium, Firefox, and WebKit.

## Telemetry

`midi.parse` and `midi.effect`. Local only.

## Tests

- Unit: `90 3C 64 80 3C 00` is a note on then a note off. A bare data byte throws. Transpose of 60 by +2 is 62. Channel 1 is dropped by a channel 0 filter.
- Browser: the shared self-check returns the same counts on all three browsers.

## Done when

`pnpm slice:gate` is green and slice 1 goldens still match.
