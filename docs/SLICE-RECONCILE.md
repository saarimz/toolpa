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

## After the reconcile commits

| Plan step | Commits | Status | What changed |
| --- | --- | --- | --- |
| S1 | `5f0a167`, `88a6dd2` | met | Closed registry, monotonic `seq`, spans, `fail()` → `error`, and a source scan that fails on `fetch(`. The wire format keeps ISO timestamps and `fields` so the existing sinks still parse. |
| S2 | `R7` (this commit), pins from `d7de918` | met | `engine.versions` matches the pinned Elementary packages. The audit requires GPL-3.0-or-later here and MIT, BSD, Apache-2.0, LGPL, ISC, or OFL-1.1 for dependencies. An AGPL fixture fails. No eslint seam and no CI workflow: this tree is not wired to a hosted runner. |
| S3 | `b4d17ef`, `1d09b40` | accepted deviation | Voices and subpatches throw `SLICE_UNSUPPORTED`. `ir.validate` and `ir.hash` fire. The identity stays SHA-256 of the canonical document on purpose: that is the registry design, and it is the hash the playground, the goldens, and the artifact id already use. It is not a per-node FNV and it does not reproduce `@elemaudio/core` `hashNode`. |
| S4 | `e195e90`, `28201e8`, `253666e`, `5b9b37e` | met | `engine.lower` reports exactly one `svf`. A bare sine has none. |
| S5 | `d9ee6a1`, `5b9b37e` | met | `render.twice` records `identical: true`. `el.const({value: Infinity})` emits `render.nan` and throws `ENGINE_NAN`. |
| S6 | `28201e8`, `d9ee6a1`, `R7` (this commit) | met | WAV goldens stay. A 220 Hz sine is within 5 cents. Seeded noise through an 800 Hz lowpass has at least 24 dB less energy from 3.2–6.4 kHz than from 100–600 Hz. `golden.check` is emitted when the goldens match. |
| S7 | `b480e16`, `64c02dc` | partial | PCM-16 and float32 inputs decode. 8-bit and other non-PCM formats throw `WAV_UNSUPPORTED_FORMAT`. The Node export is still PCM-16, so there is no float32 bit-exact writer and no LIST/INFO `ITOK` chunk. Non-48 kHz files are resampled on the way into the graph instead of being rejected. |
| S8 | `253666e`, `5b9b37e` | met | `SampleVfs.copy` returns the registered frames unchanged. A second register reports `inserted: false`. A wrong key is `VFS_KEY_MISMATCH`. A missing key throws `SampleError` and `renderChain` does not invent silence. The audible Elementary player is still interpolated; the exact path is the copy. |
| S9 | `d7de918`, `e97ab5c` | met | `ctx.latency`, `engine.init`, and `live.load` fire on start. `noteClock(300, 0)` emits one `live.stall` and a second call emits nothing. Chromium, Firefox, and WebKit run that detector after a real play. An equal-hash swap emits `live.swap` with `noop: true`. |
| S10 | `64c02dc`, `f23a956` | partial | Canonical MP3 decode matches across the three browsers. `source.load` and `source.decode` fire. There is no 50 MB cap and no renamed-text negative. The decoder is mpg123, not WebAudio. |
| S11 | `f23a956`, `c01f0df` | met | Play, stop, render, and save emit `ui.action`. The trace panel and Download trace button are on the page. Cutoff and gain have numeric inputs. |
| S12 | `749488f`, `e97ab5c` | met | A module worker renders the sine golden. Chromium's WAV SHA-256 equals the Node golden. A missing sample returns `missing` and no WAV. Firefox and WebKit run the same worker; a byte mismatch there is recorded, not failed. |
| S13 | `da93c86`, `349e4df` | met | fflate store-method zip, fixed mtime, `tpa1:sha256:` content id. Repack is byte-identical. A new title changes the content id and not the graph hash. Tamper, zip-slip, duplicate names, an unknown file, a 2 GB declared size, and a float each get their own error. Unpack-then-render matches the direct WAV. The playground's OPFS file is still the canonical JSON envelope; the zip is the `.toolpa` pack API. |
| S14 | `d83f3b3`, `749488f`, `c01f0df` | met | The playground saves v2 with `parents` pointing at v1. After reload, v1 restores 600 Hz and gain 0.25, and the WAV checksum matches the pre-save render. WebKit still cannot open OPFS here (`UnknownError`), recorded in `tmp/non-gating.json`. |
| S15 | `f74dd32`, `R7` (this commit) | met | `pnpm slice:gate` is the gate. `HARDENING.md` records the E1 blocking note. The report is still point samples rather than p50/p95. |

Deviations that stay, and why:

- Accepted: the chain hash is SHA-256 of the canonical document. That matches the registry design. A per-node FNV that mirrors `hashNode` is not the identity.
- The audible sample player is Elementary's `el.sample`, which interpolates. The sample-exact promise is the VFS copy, and a missing buffer throws before render.
- Goldens and the playground run at 44.1 kHz. The lowpass measurement runs at 48 kHz.
- WebKit OPFS and, when it fails, native WebKit MP3 stay non-gating. The worker WAV compare is gating on Chromium only.
