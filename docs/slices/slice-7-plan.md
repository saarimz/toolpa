# Slice 7 — Packaging

Depends on slices 1 and 2.

## Goal

One performance exports a dry stem, a wet stem, a Standard MIDI file, an SFZ region, and a sample-pack zip. A command writes a slice 1 chain to WAV.

## Steps

1. Render the voice sum as the dry stem and the toned instrument as the wet stem.
2. Write SMF type 0 at PPQ 960 with a 120 bpm tempo map.
3. Write one SFZ region pointed at `samples/<sha256>.wav`.
4. Zip the SFZ and a wav. Unpack to the same names.
5. `pnpm toolpa render` reads a chain JSON and writes a WAV. Publishing to a registry stays a follow-up.

## Telemetry

`export.stem` and `export.smf`.

## Tests

- Unit: dry and wet WAV hashes differ, and wet matches `renderInstrument`.
- Unit: the SMF bytes match the committed fixture, twice.
- Unit: the SFZ text matches the fixture, and the pack lists both names.
- Browser: the SMF self-check length and header match.
- The slice 1 sine golden hash is unchanged.

## Done when

`pnpm slice:gate` is green.
