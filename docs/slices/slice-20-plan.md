# Slice 20 — Playground studio

Depends on slices 5, 7, and 8.

## Goal

The playground grows a device browser, a rack editor, a piano roll, and an export dialog. The chain editor stays as it is.

## Steps

1. List keys, a sine instrument, and a lowpass.
2. Compose that order with the existing rack rules.
3. Toggle notes on an eight-by-eight roll.
4. Export MIDI, SFZ, stems, and a sample pack from the pack package.
5. Keep 16-bit, 24-bit, and float WAV on the existing render buttons.

## Telemetry

`device.register`, `rack.compose`, `export.smf`, `export.stem`, `export.sfz`, and `export.pack`.

## Tests

- A legal rack hashes and an effect-first rack returns `RACK_ORDER`.
- One roll note becomes an SMF file whose header is `MThd`.
- Chromium, Firefox, and WebKit click the devices, the roll, and each export.

## Done when

`pnpm slice:gate` is green.
