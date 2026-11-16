# Slice 18 — Live performance

Depends on slice 8.

## Goal

Scenes, MIDI learn, a quantized launch, and xrun telemetry, with a page a player can click.

## Steps

1. A set holds scenes. Selecting one is traced.
2. Learn arms a parameter. The next control change binds it.
3. Launch rounds the playhead up to the quantum.
4. An xrun event records underruns and output latency.
5. The performance page exposes those actions as buttons.

## Telemetry

`performance.scene`, `performance.learn`, `performance.launch`, `performance.xrun`.

## Tests

- 1.2 beats at quantum 1 launches at beat 2.
- CC 74 maps to cutoff.
- Browsers click scene, learn, CC, launch, and xrun.
- The existing live clip still plays.

## Done when

`pnpm slice:gate` is green.
