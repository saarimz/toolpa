# Hardening

## Slice 1

One chain. A sine, seeded noise, or a sample identified by the SHA-256 of its file bytes goes through Tone (lowpass, then gain), then a meter and the output. Live playback and the offline WAV render use that same chain document and hash. The chain saves as a content-addressed `.toolpa` file in the origin private file system, with parent ids in the hashed bytes.

- Telemetry is `@toolpa/trace` only. Tests write NDJSON. The browser keeps a ring buffer. The network guard fails a run that calls `fetch`, XHR, WebSocket, or `sendBeacon` off the allow list. There is no third-party analytics.
- Offline goldens pin the sine, noise, and sample WAV bytes. A fresh Elementary renderer is used for every render so the bytes stay stable.
- `pnpm slice:gate` runs the unit tests, the Chromium, Firefox, and WebKit browser tests, renders the goldens again, and prints the local telemetry report.
- WebKit in this Linux environment cannot open the origin private file system. `navigator.storage.getDirectory()` rejects with `UnknownError`. Those OPFS checks are recorded in `tmp/non-gating.json` and do not fail the gate. Chromium and Firefox OPFS save, load, and parent walk are gating. Live playback and offline render still run on WebKit.
- Native MP3 decode is checked on all three browsers. If WebKit's `decodeAudioData` fails, that one check is recorded and is not gating. The canonical decoder is the bundled mpg123 WASM, and that path is gating everywhere.
- The E1 per-voice effect bug is blocking for anything beyond this slice. `lowerVoiced` mounts the whole graph `maxVoices` times, so an effect placed inside a voice would run once per voice. This slice has no voices: a graph with `voices.length > 0` or a subpatch throws `SLICE_UNSUPPORTED`, and Tone lowers to exactly one `svf`. The voice-section versus post-voice-section fix has to land before any instrument is sent through this effect.
- The chain hash is SHA-256 of the canonical chain document. It is not a per-node FNV, and it is not `@elemaudio/core`'s `hashNode`.
- The sample-exact path copies the registered frames. Elementary's sample player interpolates, so that player is not the identity check. A missing buffer throws `SampleError` and does not render silence.
- The playground and the committed goldens are 44.1 kHz. The lowpass band measurement and the pitch check render at 48 kHz.
- `.toolpa` pack/unpack/verify is a store-method zip (fflate, MIT) with a `tpa1:sha256:` content id. The OPFS library still stores the canonical JSON envelope, which is what the playground reloads.
- License audit: first-party packages are GPL-3.0-or-later. Direct dependencies must be MIT, BSD, Apache-2.0, LGPL, ISC, 0BSD, or OFL-1.1. AGPL is rejected. OFL-1.1 is the SIL font license on the playground's Geist face, which the FSF lists as GPL-compatible.
- WAV export writes PCM-16, PCM-24, and 32-bit IEEE float. Float files include a `fact` chunk. Every render embeds an `ITOK` chunk: format version 1 and the SHA-256 of the chain document, so the WAV points back at its `.toolpa` artifact. PCM-16 and PCM-24 round-trip within one least significant bit. Float32 round-trips bit-exactly. A reader that only understands `fmt` and `data`, and the browser's `decodeAudioData`, both ignore `ITOK`.
- The chain identity is SHA-256 of the canonical document. That is the registry design, kept on purpose.
- Loaded WAV and MP3 files may be at most 50 MB. One byte over that throws `LOADER_TOO_LARGE` before decode. The MP3 decoder remains mpg123 WASM: one implementation in Node and in every browser, instead of each browser's `decodeAudioData`.
- The gate report prints nearest-rank p50 and p95 for a 0.25 s sine render and for WAV and MP3 decode, from 20 runs.
- `.github/workflows/slice.yml` runs `pnpm slice:gate`. Nothing in this environment executes that workflow.
- A non-48 kHz sample is still resampled into the chain. The plan's Node path would have rejected it.
