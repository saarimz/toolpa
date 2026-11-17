# Slice 2 — Voices and a MIDI-to-audio instrument

Depends on slice 1. The chain document does not change.

## Goal

Notes become sine voices. Those voices are summed, and the slice 1 Tone effect is applied once to the sum. That is the voice section versus the post-voice section: one lowpass, however many notes are sounding.

## Steps

1. Parse and hash an `instrument` document. Reject a bad MIDI note, a zero duration, and `maxVoices` outside 1–8.
2. Allocate voices. When overlapping notes exceed `maxVoices`, drop the oldest note and record `voice.steal`.
3. Lower the sounding voices with Elementary `adsr` and `cycle`, sum them, then call the existing `applyTone`.
4. Render offline twice and require identical WAV bytes. Assert the lowered graph contains one `svf`.
5. Serve the same render on the live probe at `/instrument` and check it in Chromium, Firefox, and WebKit.

## Telemetry

`@toolpa/trace` only. New names: `voice.allocate`, `voice.steal`, `instrument.render`. No network sink.

## Tests

- Unit: allocation drops the oldest of three overlapping notes when `maxVoices` is 2.
- Unit: two renders of a two-note instrument are byte-identical, the peak is above 0.01, and `svf` count is 1.
- Unit: the slice 1 sine golden hash is still `59d86cf3314f9c8c44bd7b2523a400c4191e27eed50e80434d753d4616dc94b8`.
- Browser: `/instrument` reports one `svf`, a matching second render, and a positive peak on all three browsers.

## Done when

`pnpm slice:gate` is green and the slice 1 goldens match.
