# Slice 12 — Sampler

Depends on slices 1 and 7.

## Goal

SFZ regions become velocity-layered looping zones.

## Steps

1. Parse regions with a sha256 sample path, key range, velocity range, and loop points.
2. Pick the lowest matching zone.
3. Play the loop with a wrapping table read.

## Telemetry

`sampler.zone`.

## Tests

- Two regions split on velocity.
- A bad sample path throws.
- Two renders of the loop match, peak above 0.05.
- Browsers import one region.

## Done when

`pnpm slice:gate` is green.
