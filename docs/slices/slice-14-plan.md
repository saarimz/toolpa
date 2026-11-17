# Slice 14 — Audio input

Depends on slice 8.

## Goal

A live capture lands on `InputBus`, delayed by the latency difference, with a monitor that can be off.

## Steps

1. Keep the silent bus for `live: false`.
2. `live: true` uses an injected capture or `getUserMedia`.
3. Delay is `round(max(0, outputLatency - inputLatency) * sampleRate)`.
4. Monitor off leaves the bus intact and reports peak 0.
5. Leave the no-argument `openMicrophone()` throw in place.

## Telemetry

`input.open` with `live`, `monitor`, and `delay`.

## Tests

- Silent peak is 0.
- A 10-sample delay shifts the buffer.
- Extra input latency clamps the delay to 0.
- Node without media devices throws `MIC_UNAVAILABLE`.
- A NaN sample throws.
- Browsers run the stub, not a permission prompt.

## Done when

`pnpm slice:gate` is green.
