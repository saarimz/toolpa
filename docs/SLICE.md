# Toolpa v2, slice 1

Source, then one audio effect, then the output. The same graph plays live, renders to WAV, and saves as a content-addressed `.toolpa`.

This is the step list from `slice-1-plan.md`. The original `S1`–`S15` commits used different titles. [SLICE-RECONCILE.md](SLICE-RECONCILE.md) maps those commits, and the later `R*` commits, onto this list.

| Step | Title | Goal |
| --- | --- | --- |
| S1 | Skeleton: workspace, three-tier harness, `@toolpa/trace` | A local trace with a sequence number, spans, a closed event registry, and no network calls. |
| S2 | Seams and the Elementary pin | Elementary stays behind the audio package. Versions are pinned. Licenses are GPL-compatible. |
| S3 | Slice IR: schema, validation, hash | One chain. Voices and subpatches are rejected. The hash ignores key order. |
| S4 | Lowering for the slice kinds | Sine, seeded noise, sample, lowpass, gain, and meter. The lowpass is one `svf`. |
| S5 | Offline driver and determinism | Two renders of the same graph are byte-identical. A non-finite buffer is an error. |
| S6 | Goldens and the lowpass response | Committed WAV goldens. A 220 Hz sine stays in tune. Noise above 3.2 kHz is at least 24 dB down. |
| S7 | WAV I/O | PCM WAV in, PCM-16 WAV out. 8-bit and ADPCM are rejected. |
| S8 | Content-addressed sample path | The key is the SHA-256 of the file. A missing sample is an error, and the identity copy is sample-exact. |
| S9 | Live driver | Playback on Chromium, Firefox, and WebKit, with latency and a clock-stall detector. |
| S10 | Browser loader | WAV and MP3 decode in the browser. Native WebKit MP3 is recorded, not required. |
| S11 | Playground | Pick a source, set Tone, play, watch the meter, download the trace. |
| S12 | Worker WAV and live == offline | A module worker renders the golden sine. On Chromium the WAV bytes match Node. |
| S13 | `.toolpa` pack, unpack, verify | A zip with a `tpa1:sha256:` content id. Tamper, zip-slip, duplicates, unknown files, a 2 GB entry, and floats are rejected. |
| S14 | OPFS versions and parents | Save v1, save v2 pointing at v1, reload v1, and the WAV matches. WebKit OPFS is recorded when the browser refuses it. |
| S15 | Slice gate and the ledger | `pnpm slice:gate` runs the unit tests, the three browsers, and prints the local telemetry. |

License is GPL-3.0-or-later. Telemetry stays in-process.
