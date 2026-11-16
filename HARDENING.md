# Hardening

## Slice 1

One chain. A sine, seeded noise, or a sample identified by the SHA-256 of its file bytes goes through Tone (lowpass, then gain), then a meter and the output. Live playback and the offline WAV render use that same chain document and hash. The chain saves as a content-addressed `.toolpa` file in the origin private file system, with parent ids in the hashed bytes.

- Telemetry is `@toolpa/trace` only. Tests write NDJSON. The browser keeps a ring buffer. The network guard fails a run that calls `fetch`, XHR, WebSocket, or `sendBeacon` off the allow list. There is no third-party analytics.
- Offline goldens pin the sine, noise, and sample WAV bytes. A fresh Elementary renderer is used for every render so the bytes stay stable.
- `pnpm slice:gate` runs the unit tests, the Chromium, Firefox, and WebKit browser tests, renders the goldens again, and prints the local telemetry report.
- WebKit in this Linux environment cannot open the origin private file system. `navigator.storage.getDirectory()` rejects with `UnknownError`. Those OPFS checks are recorded in `tmp/non-gating.json` and do not fail the gate. Chromium and Firefox OPFS save, load, and parent walk are gating. Live playback and offline render still run on WebKit.
- Native MP3 decode is checked on all three browsers. If WebKit's `decodeAudioData` fails, that one check is recorded and is not gating. The canonical decoder is the bundled mpg123 WASM, and that path is gating everywhere.
