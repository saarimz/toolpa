# Toolpa

Toolpa v2 slice 1 is a single audio chain for the browser: a source, a Tone effect (lowpass then gain), a meter, and the output. It is built on [Elementary Audio](https://www.elementary.audio/). The same chain plays live and renders to WAV, then saves as a content-addressed `.toolpa` file in the origin private file system.

License: GPL-3.0-or-later.

## Requirements

- Node.js 22
- pnpm 10

## Playground

```bash
pnpm install
pnpm dev
```

The playground listens on [http://127.0.0.1:47291](http://127.0.0.1:47291). Choose a sine, seeded noise, or a WAV/MP3 sample, set the tone, and press Play. Render 1s WAV downloads the offline render of the same chain. Save artifact writes the `.toolpa` file, and any sample bytes, into this origin's private file system. The short ids under "Saved in this browser" load a chain back, including after a reload.

Firefox and WebKit need a working audio device for Play. A PulseAudio null sink is enough when the machine has no sound card. WebKit on Linux may be unable to open OPFS; Chromium and Firefox can.

## Gate

```bash
pnpm test
pnpm test:browser
pnpm slice:gate
```

`pnpm test` runs the unit tests and the offline WAV goldens. `pnpm test:browser` runs Playwright on Chromium, Firefox, and WebKit. `pnpm slice:gate` runs both, renders the golden chains again, and prints a local telemetry report: test counts, render speed as a multiple of realtime, decode time, and live latency and underruns.

Telemetry is the `@toolpa/trace` logger: NDJSON in tests, an in-memory ring in the browser. It does not send anything over the network. A guard fails the test run if code calls `fetch`, XHR, WebSocket, or `sendBeacon` outside the allow list. The playground allows its own origin and `blob:` URLs so the audio worklet can load, and blocks everything else.
