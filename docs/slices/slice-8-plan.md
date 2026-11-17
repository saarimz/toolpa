# Slice 8 — Live performance

Depends on slices 2 and 4.

## Goal

A transport launches a clip, and the meter moves on Chromium, Firefox, and WebKit.

## Steps

1. Map beats to seconds. One beat at 120 bpm is 0.5 seconds.
2. A clip is a pulse pattern plus an instrument. Launch schedules the notes and renders them.
3. Play that instrument through the live renderer. The meter peak crosses 0.05.
4. `InputBus` is a silent local bus. `openMicrophone` throws `MIC_FOLLOWUP`.

## Out of this slice

The plan's lookahead scheduler, swing, and the three playground demos need the engine that slice 1 deferred. They stay follow-ups. `getUserMedia` stays a follow-up because the gate has no microphone.

## Telemetry

`transport.launch` with bpm, note count, and step length. Live playback still records `playback.started`.

## Tests

- Unit: `beatToSeconds(1, 120) === 0.5`. Out-of-range tempos throw.
- Unit: a launched clip's WAV matches rendering the scheduled instrument directly.
- Unit: a registered bus peaks at 0, and `openMicrophone` throws `MIC_FOLLOWUP`.
- Browser: Play on `/performance` reaches a peak above 0.05 with no underruns, on three browsers.
- Slice 1 golden hashes stay put.

## Done when

`pnpm slice:gate` is green.
