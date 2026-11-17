# Slice 17 — Cookbook

Depends on slices 9 and 10.

## Goal

Forty patches load and render. One digest pins every buffer.

## Steps

1. Build forty canonical IR graphs from the primitive families the engine can lower.
2. Parse each graph. Lower const, cycle, band-limited oscillators, noise, mul, add, and lowpass.
3. Render 128 frames at 44.1 kHz. Hash each buffer. Hash the joined list.

## Telemetry

`cookbook.render` with the count and the quietest peak.

## Tests

- Count, unique names, unique hashes, peak floor, pinned digest.
- A second render matches.
- Browsers report the same digest.

## Done when

`pnpm slice:gate` is green.

## Deviation

The docs describe byte-for-byte copies of `ai-daw-tools` cookbook JSON. That directory was not in the docs bundle, so these patches are new canonical graphs rather than legacy files.
