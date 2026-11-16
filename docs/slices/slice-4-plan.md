# Slice 4 — Generators

Depends on slices 2 and 3.

## Goal

A step pattern or a prompt becomes MIDI notes with no network. The same prompt is the same pattern.

## Steps

1. Euclidean rhythm over a fixed step count, rotated so a pulse lands on step 0 when there is one.
2. Turn pulses into notes from a root pitch.
3. `LocalPromptProvider` hashes the prompt text and picks pulses, root, and velocity.
4. `RemotePromptProvider` throws `NOT_CONFIGURED`. A hosted model is the follow-up.
5. Schedule the notes on a slice 2 instrument and render twice.
6. Repeat the prompt check in all three browsers.

## Telemetry

`generate.pattern` and `generate.prompt`.

## Tests

- Unit: `euclidean(8, 3)` is `[1, 0, 0, 1, 0, 1, 0, 0]`.
- Unit: `"bass"` twice is deep-equal, and it differs from `"lead"`.
- Unit: the scheduled instrument renders byte-identical audio with a peak above 0.01.
- Browser: the self-check reports the same first MIDI note and pulse count.

## Done when

`pnpm slice:gate` is green and slice 1 goldens still match.
