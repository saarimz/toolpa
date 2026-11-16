# Slice 1 reconciliation

The plan is `slice-1-plan.md` (source → one Tone effect → live, offline WAV, and a content-addressed `.toolpa`). The shipped commits S1–S15 used a different numbering. This file maps the plan's steps by content.

The "before" column is the tree at `f74dd32` (`S15: Slice gate`), before the `R*` commits. The "after" column is filled in as those commits land.

Shipped package names differ from the plan: `@toolpa/graph` holds the chain document (the plan's `ir`), `@toolpa/audio` holds Elementary lowering and both drivers (the plan's `engine`), `@toolpa/samples` holds WAV/MP3 (the plan's `fixtures/samples`). The hash is SHA-256 of canonical JSON, not a per-node FNV.

## Before the reconcile commits

| Plan step | Shipped commits | Acceptance | Telemetry | Done | Status |
| --- | --- | --- | --- | --- | --- |
| S1 trace and harness | `5f0a167` | Ring, NDJSON, and a runtime network guard pass. Seq, spans, `fail()`, unknown-name rejection, and a source scan for `fetch(` are absent. One Vitest project, no eval/browser split, no worklet canary event. | `trace.ready`, `net.blocked`. No `harness.canary`. | Unit and Playwright are green. No `pnpm build` / lint / eval tier. | partial |
| S2 seams and pin | pins inside `d7de918` | Elementary versions are pinned in `packages/audio`. No eslint seam, headless check, vendor hash, or license audit. | No `engine.versions`. | — | partial |
| S3 IR, hash, fixtures | `b4d17ef` | Canonical hash ignores key order. Changing cutoff changes the hash. No voices/subpatch rule, no per-node hash parity, no `sha256:` path form. | `graph.hashed`, not `ir.validate` / `ir.hash`. | Unit green. | partial |
| S4 lowering | `e195e90`, `28201e8`, `253666e` | Sine, noise, and sample lower and render. No single-`svf` count, no `createRef` memo, sample uses `trigger` rather than `loop`. | `effect.tone`, `source.rendered`. No `engine.lower`. | Unit green. | partial |
| S5 offline determinism | `d9ee6a1` | Render-twice byte identity for sine, noise, and sample. No `render.twice` event, no NaN throw, no audible-vs-silence negative. Duration is 0.25 s at 44.1 kHz. | `render.offline`, `render.realtime`. | Goldens committed. | partial |
| S6 goldens and lowpass | `28201e8`, `d9ee6a1` | WAV-byte goldens. No pitch check, no 24 dB band test, no anti-fixtures. | No `golden.check`. | — | partial |
| S7 WAV I/O | `b480e16`, `64c02dc` | PCM-16 WAV and an MP3 fixture. No float32/PCM-24 round trip, no header hex golden, no 8-bit rejection, no 48 kHz-only rule. | `sample.decoded`, `decode.ms`. No `wav.encode` / `wav.decode` spans. | Fixtures committed. | partial |
| S8 sample VFS | `253666e` | SHA-256 key, deterministic render through Tone. Not sample-exact. Missing buffer throws `SampleError` inside `renderChain`, without a test that the result is never silence. | `source.sample`. No `vfs.register`. | — | partial |
| S9 live driver | `d7de918` | Play is audible on C/F/W, hash matches offline, underruns stay 0 in the happy path. No silent-before-play check, no hash-noop swap, no 48 kHz pin, no `playbackStats`, no forced stall. | `playback.started` / `stats` / `stopped`. No `ctx.latency`, `live.stall`, `live.load`. | Browser green. | partial |
| S10 browser loader | `64c02dc`, playground in `f23a956` | Canonical WASM decode matches across C/F/W. Native MP3 is recorded, not gated, and it succeeded here. No decode cache, no 50 MB cap, no renamed-text negative. | `sample.decoded`. Decoder is mpg123, not WebAudio. | — | partial |
| S11 playground | `f23a956` | Sine plays, meter moves, hash is the golden. No noise-while-playing swap, no file-drop meter, no centroid, no stop-to-silence, no trace HUD. | `playground.ready` / `render`. No `ui.action`. | e2e green. | partial |
| S12 worker parity | `749488f` | Offline WAV download and a reload checksum. No worker, no byte compare against the Node WAV, no `ITOK`, no missing-sample UI. | `playground.render`. No `export.wav`. | — | partial |
| S13 zip artifact | `da93c86` | Canonical JSON `.toolpa` with parents. Not a zip. No tamper, zip-slip, duplicate, unknown-file, or float checks. Title is not a separate content id. | `artifact.sealed` / `opened` / `saved` / `loaded`. No pack/verify/unpack spans. | Unit green. | partial |
| S14 OPFS versions | `d83f3b3`, `749488f` | Save, reload, and the same chain hash on C/F. WebKit OPFS does not open here. No v2→v1 pointer test, no knob restore, no download/import, no tamper toast. | `artifact.saved` / `loaded`. | C/F green. W recorded. | partial |
| S15 gate and ledger | `f74dd32` | `pnpm slice:gate` is green and prints point measurements. `HARDENING.md` exists without the E1 blocking note. No percentile report and no report-script unit test. | Report prints realtime, decode ms, latency, underruns. | Gate green. | partial |

## After

Filled in by the last reconcile commit.
