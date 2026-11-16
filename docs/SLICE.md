# Toolpa v2 slice 1

One flat chain, no voices. A source (sine, seeded noise, or a WAV/MP3 buffer keyed by SHA-256) goes through one audio-to-audio effect named Tone (lowpass, then gain), then a meter, then the output. The graph is Elementary Audio. The same document plays live and renders offline to WAV. It saves and loads as a content-addressed `.toolpa` artifact (`kind: "chain"`) in OPFS, with parent pointers.

The uploaded step plan and design-doc tarball were not on disk when this repo was built. These fifteen steps are the slice that was implemented from that brief. Each step is one commit, `S<n>: <title>`, and is green before the next one starts.

| Step | Title | What lands |
| --- | --- | --- |
| S1 | Local-only trace logger | `@toolpa/trace`: NDJSON, in-memory ring, network guard |
| S2 | Chain document and content hash | `@toolpa/graph`: `kind: "chain"`, canonical JSON, SHA-256 |
| S3 | WAV decode and sample identity | `@toolpa/samples`: PCM decode, hash of the file bytes |
| S4 | MP3 decode | Same identity for MP3. Native WebKit decode is recorded, not gating |
| S5 | Sine and seeded noise | Elementary sources, offline, deterministic |
| S6 | Tone effect | Lowpass then gain, with a spectrum check |
| S7 | Output meter | Peak and RMS on the rendered buffer |
| S8 | Sample source | Buffer keyed by SHA-256 inside the graph |
| S9 | Offline WAV | Shared render path, speed metric, goldens |
| S10 | Live playback | Web renderer, latency and underrun counters, three browsers |
| S11 | Playground | The only React UI: source, tone, meter, render |
| S12 | `.toolpa` artifact | Content-addressed chain document with parents |
| S13 | OPFS save and load | Browser store, parent walk, three browsers |
| S14 | One hash, two renders | Live session and offline WAV share the chain hash |
| S15 | Slice gate | `pnpm slice:gate`, HARDENING entry, telemetry report |

License is GPL-3.0-or-later on the repo and every package. Telemetry stays in-process. There is no third-party analytics.
