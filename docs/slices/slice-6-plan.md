# Slice 6 — Agent

Depends on slice 5.

## Goal

A chat turn turns a short prompt into a rack, auditions it, and keeps a provenance record. The model is local. A hosted model is not called.

## Steps

1. `MockModel` splits the prompt into device words: `keys`, `sine`, `lowpass`.
2. `RemoteModel` throws `NOT_CONFIGURED`.
3. Each attempt registers those devices and composes a rack. `maxAttempts` stops the loop.
4. Provenance stores the prompt, the rack hash, the attempt count, and the provider name. It stores no secret.
5. Run one successful turn and one budget stop in all three browsers.

## Telemetry

`agent.turn` and `agent.audition`.

## Tests

- Unit: `keys sine lowpass` twice returns the same hash. `lowpass sine` with one attempt throws `AGENT_BUDGET`.
- Unit: the provenance JSON has no secret field.
- Browser: the self-check hash matches and the budget code is `AGENT_BUDGET`.

## Done when

`pnpm slice:gate` is green and slice 1 goldens still match.
