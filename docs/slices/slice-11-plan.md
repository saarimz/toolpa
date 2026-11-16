# Slice 11 — Effects

Depends on slice 1.

## Goal

Delay, reverb, dynamics, EQ, distortion, and chorus render deterministically.

## Steps

1. Tempo-sync a delay. Reject non-finite or unstable feedback.
2. Convolve a fixed exponential impulse.
3. Compress, limit, EQ, saturate, and chorus.
4. Compare each wet render with the dry render.

## Telemetry

`effect.apply` with the effect name, peak, and RMS.

## Tests

- 120 bpm, one beat, 44100 Hz → 22050 samples.
- Delay and reverb WAV hashes are pinned. Two renders match.
- Wet differs from dry. RMS is finite.
- Browsers agree on the beat length and that delay differs from dry.

## Done when

`pnpm slice:gate` is green.
