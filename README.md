# Toolpa

Toolpa v2 slice 1 is a single audio chain for the browser: a source, a Tone effect (lowpass then gain), a meter, and the output. It is built on [Elementary Audio](https://www.elementary.audio/). The same chain plays live and renders to WAV, then saves as a content-addressed `.toolpa` file in the origin private file system.

License: GPL-3.0-or-later.

## Requirements

- Node.js 22
- pnpm 10

## Scripts

```bash
pnpm install
pnpm test
pnpm test:browser
pnpm dev
pnpm slice:gate
```

`pnpm test` runs the unit tests and the offline render checks. `pnpm test:browser` runs Playwright on Chromium, Firefox, and WebKit. `pnpm dev` starts the playground once that step exists. `pnpm slice:gate` runs the full slice and prints a local telemetry report.

Telemetry is the `@toolpa/trace` logger: NDJSON in tests, an in-memory ring in the browser. It does not send anything over the network. A guard fails the test run if code calls `fetch`, XHR, WebSocket, or `sendBeacon`.
