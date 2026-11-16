# Slice 10 — Polysynth

Depends on slice 2.

## Goal

A polysynth is built from oscillators, an ADSR, a filter, and an LFO.

## Steps

1. Oscillators: cycle, saw, square, triangle, noise, blepsaw.
2. ADSR per note. Sum the voices. Mount the filter after the sum.
3. SVF lowpass, highpass, bandpass, and a four-pole ladder.
4. An LFO adds to the cutoff. `dcblock` guards denormals. A non-finite cutoff throws.

## Telemetry

`synth.osc` and `synth.render` (hash, svf count, peak, rms).

## Tests

- Each oscillator renders twice to the same bytes, peak above 0.01, one SVF.
- Blepsaw WAV sha256 is pinned.
- Ladder mounts four SVFs. The LFO changes the hash.
- Browsers render the demo. Slice 1 goldens stay put.

## Done when

`pnpm slice:gate` is green.
