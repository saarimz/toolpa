# Toolpa v2 slices

Slice 1 is the audio-to-audio chain: one source, one Tone effect, live and offline, content-addressed `.toolpa`. It is done on `v2-slice-1`. The chain document and its golden hashes stay as they are. Later slices add new document kinds. They do not rewrite a slice 1 chain.

The source of truth for scope is `mvp_implementation_plan/` (phases 0–9) plus `docs/00`–`13`, `registry-design.md`, and `architecture-study.md`. Slice 1 already took the vertical path through bootstrap, a flat chain in place of the full IR, Elementary lowering for six kinds, offline and live drivers, WAV, samples, and the zip artifact. These slices cover what that left.

A feature that needs a paid API or a hardware device is built behind an interface with a deterministic local provider. Wiring the real provider is a follow-up, not a gate.

| Slice | Status | Plan phases | Goal |
| --- | --- | --- | --- |
| 1 | done | 0, 1 (flat chain), 2, 5 (six kinds), 9 playground, registry pack | Source, Tone, meter, WAV, `.toolpa`. |
| 2 | done | 3.1 | MIDI-to-audio instrument. Voices sum first. Tone is mounted once after the sum. |
| 3 | done | 6.1, 6.2, 6.4 | MIDI bytes, a keyboard source, and MIDI-to-MIDI devices. |
| 4 | done | 6.3, prompt generators | Step and euclidean patterns, and a prompt that becomes MIDI. |
| 5 | done | 7.1, 7.3 | Device registry and a rack that composes those roles. |
| 6 | done | 8.1–8.4 | Agent loop that builds a device from a prompt, with a local model. |
| 7 | done | 6.6, 10 packaging, 9.2 | Stems, SMF, SFZ, a sample pack, and a render command. |
| 8 | done | 3.2, 7.5, 9.1 | Transport, a launched clip, and a live meter on three browsers. |
| 9 | done | 1.1, 1.2, 1.3 | Full IR, Elementary FNV-1a node hashes, and SHA-256 document identity. |
| 10 | done | 5.1 | Oscillators, ADSR, SVF, a 4-pole ladder, an LFO, and a polysynth. |
| 11 | done | 5.4 | Tempo delay, convolution reverb, compressor, limiter, EQ, distortion, chorus. |
| 12 | done | 5.5, 6.6 | Multi-sample zones, velocity layers, loop points, and SFZ import. |
| 13 | done | 6.2 | Web MIDI access, a device list, hot-plug, and clock in/out. The fake port stays. |
| 14 | done | 3.3 | Live audio input with latency compensation and a monitor toggle. The silent bus stays. |
| 15 | done | 8.2 | Vercel and Cloudflare AI gateways, with direct OpenAI-compatible and Ollama behind them. Mock stays the default. |
| 16 | done | 4 | JSX, DSL, and JSON author the same canonical IR document. |
| 17 | done | 1.5, 7.2 | Forty loadable patches, each rendered and pinned by one digest. |
| 18 | done | 3.2, 6.5, 9.1 | Scenes, MIDI learn, quantized launch, and xrun telemetry. |
| 19 | done | 9.3 | IndexedDB index, OPFS blobs, and an IndexedDB blob fallback. |
| 20 | done | 9 playground | Device browser, rack editor, piano roll, and an export dialog. |
| 21 | done | 8.2, 9 playground | A prompt generates a playable instrument through the same-origin agent proxy. |
| 21.1 | done | 8.2, 9 playground | The prompt panel shows the configured provider, and the agent stream stays alive while the model answers. |
| 22 | done | 8.2, 5, 9 playground | A prompt becomes a rich instrument. A model failure stays a failure. |

## Slice 2 — Voices

**Goal.** A note list plays a sine voice per note. The existing Tone effect sits after the sum, so one lowpass serves every voice.

**Scope.** An `instrument` document (kind, version, sample rate, voice envelope, max voices, notes, tone). Overlapping notes beyond `maxVoices` steal the oldest voice. The slice 1 chain still rejects `voices` and `subpatch`.

**Exit.** Two offline renders match. The lowered graph contains one `svf`. A stolen-voice case is traced. Slice 1 goldens are unchanged. Chromium, Firefox, and WebKit render the same instrument twice and the bytes match.

## Slice 3 — MIDI

**Goal.** MIDI bytes and a computer keyboard become note events, and MIDI-to-MIDI devices transform that list.

**Scope.** Note on, note off, and control-change parsing. Running status is rejected in this slice. Devices: transpose, velocity scale, channel filter. Web MIDI is a `MidiPort` interface. Tests use a fake port. A physical interface is the follow-up.

**Exit.** Known byte strings produce an exact event list. Bad status bytes throw. Transpose changes pitch and nothing else. The fake port delivers the same events in all three browsers.

## Slice 4 — Generators

**Goal.** A pattern or a prompt produces MIDI events with no network.

**Scope.** A step sequence and a euclidean rhythm. `PromptGenerator` has a `LocalPromptProvider` that maps the prompt text to a stable pattern. `RemotePromptProvider` is the paid-model seam and throws `NOT_CONFIGURED` until a key exists.

**Exit.** The same seed and the same prompt return the same events. A different prompt returns a different pattern. An instrument rendered from the pattern is byte-identical across two renders. The three browsers agree on the event list.

## Slice 5 — Registry and racks

**Goal.** Devices of four roles (midi, generator, instrument, effect) register and compose into a rack.

**Scope.** Role legality: MIDI and generators feed an instrument, then audio effects. Two instruments, or an effect before the instrument, are errors. Rendering the rack uses the slice 2 voice sum and mounts each effect once.

**Exit.** Illegal racks throw. A legal rack has a stable hash. The lowered effect count matches the rack, not the voice count. Browsers report that hash.

## Slice 6 — Agent

**Goal.** A chat turn builds a device with tools, a budget, and a provenance record.

**Scope.** Tools list the registry, propose a rack from a small command language, and audition it (short render hash). The loop stops at `maxAttempts`. The model is `MockModel`. `ModelProvider` is the seam for a hosted model and is not called. Rights stay on the local prompt text.

**Exit.** A fixed corpus of prompts yields known hashes. One extra attempt past the budget throws. Provenance stores the prompt and the rack hash and does not store a model secret. Browsers complete one scripted turn.

## Slice 7 — Packaging

**Goal.** The same performance exports to stems, a MIDI file, an SFZ region, and a sample pack.

**Scope.** Dry stem is the voice sum. Wet stem is the stem after Tone. SMF type 0, PPQ 960, writes the notes. SFZ writes one region keyed to a sample sha256. The sample pack is a zip of that SFZ plus the wav. `pnpm toolpa render` writes a WAV for a chain file. Publishing to a registry needs credentials and stays a follow-up.

**Exit.** SMF and SFZ bytes match committed fixtures. Dry and wet hashes differ, and wet matches `renderInstrument`. The pack unpacks to the same names. Slice 1 WAV goldens stay put. Browsers hash the same SMF bytes.

## Slice 8 — Live performance

**Goal.** A transport launches a clip and the meter moves.

**Scope.** Tempo maps beats to seconds. A clip is a pattern plus an instrument. Play schedules those notes. Microphone input is an `InputBus` with a silent local bus, because the runner has no microphone. `getUserMedia` is the follow-up.

**Exit.** Beat math is exact. A launched clip renders the same hash as the scheduled instrument. Chromium, Firefox, and WebKit show a live peak above 0.05 after a click.

## Slice 9 — IR

**Goal.** Instruments are documents: a graph of nodes with Elementary's per-node FNV-1a hash, plus the existing SHA-256 document id.

**Scope.** `@toolpa/ir` parses a graph (kinds, arity, refs, outputs, delay feedback, illegal cycles). A string `key` keeps the node hash stable when the value changes, so a hot-swap diff keeps that node mounted. Subpatches inline with a `__` prefix. `meta` is outside both hashes. Slice 1 chain hashes do not change.

**Exit.** `hashNode('const', {value:1})` equals `el.const({value:1}).hash`, and the same for `mul`. A keyed const keeps its hash across two values. A cycle reports `V10`. A subpatch inlines to `v__rate` and `v__osc`. The SHA-256 document id ignores `meta`. Browsers report the same keyed-stable result and `V10`.

## Slice 10 — Polysynth

**Goal.** A note list plays a real oscillator through an ADSR and one filter, with an LFO on the cutoff.

**Scope.** Oscillators: cycle, saw, square, triangle, noise, and band-limited `blepsaw`. Filters: SVF lowpass, highpass, bandpass, and a 4-pole ladder (four lowpass SVFs). `el.dcblock` guards denormals. Non-finite cutoff is rejected before render. Voices sum first. The filter is mounted once, or four times for the ladder.

**Exit.** Every oscillator renders twice to the same WAV. The blepsaw golden hash is `a2ecfe515330215f72716d5dafb12ad8a950075082bd78bcb86131e2e5d8291c`. The ladder mounts 4 SVFs. An LFO changes the WAV. Browsers render the demo polysynth with one SVF and a peak above 0.01.

## Slice 11 — Effects

**Goal.** A producer can put a tempo-synced delay, a convolution reverb, dynamics, EQ, distortion, or a chorus after a source.

**Scope.** Delay length is `(60 / bpm) * beats * sampleRate`. Feedback must be finite and below 0.95. Reverb convolves a 256-frame exponential impulse. Compressor and limiter use Elementary's `compress`. EQ is a low shelf, a peak, and a high shelf. Distortion is `tanh`. Chorus is a short modulated delay. Non-finite parameters throw before render.

**Exit.** A quarter-note at 120 bpm is 22050 samples at 44.1 kHz. Delay WAV `4b4e02729a27b608110b1567e57caf9b672ebdc3d264c8f245f4e12cd35d7842`. Reverb WAV `46b1bb39bfc2a6993cd7ed1a22d9752d4f946f885ac1410cc85fae7030d89c9d`. Every wet hash differs from dry. Peaks and RMS are finite and above the silence floor. Browsers report the delay hash and 22050.

## Slice 12 — Sampler

**Goal.** A note picks a sample zone by key and velocity, and the zone loops.

**Scope.** SFZ import reads `sample=samples/<sha256>.wav`, key and velocity ranges, and `loop_start` / `loop_end`. Overlapping zones pick the lowest key, then the lowest velocity. Playback is a wrapping `el.table` read of the loop. A sample path that is not a sha256 is rejected.

**Exit.** A quiet layer and a loud layer select different buffers. Two loop renders match and the peak is above 0.05. Browsers import one region and report the same peak floor.

## Slice 13 — Web MIDI

**Goal.** A page can list MIDI inputs, hear notes, notice a disconnect, and count MIDI clock.

**Scope.** `requestMidiAccess` calls `navigator.requestMIDIAccess` when the browser has it, or an injected request in tests. Node without Web MIDI throws `MIDI_UNAVAILABLE`. `openHardwarePort` still throws `MIDI_HARDWARE_FOLLOWUP` so unit tests never open a device. Clock out is 24 `0xF8` bytes per quarter. Hot-plug is the access `onstatechange`.

**Exit.** A fake keyboard is listed. One quarter is 24 ticks. A note-on arrives through the port. Browsers report the same list and tick count without a permission prompt.

## Slice 14 — Audio input

**Goal.** A microphone can fill the input bus, delayed so it lines up with the output, and the monitor can be muted.

**Scope.** `captureMicrophone({ live: false })` registers a silent `mic` bus. `live: true` calls an injected `getUserMedia`, or `navigator.mediaDevices.getUserMedia` when the page has one. Delay frames are `max(0, outputLatency - inputLatency) * sampleRate`. Monitoring off reports a monitor peak of 0 while the bus keeps the signal. `openMicrophone()` with no arguments still throws `MIC_FOLLOWUP`. A missing media device throws `MIC_UNAVAILABLE`. Non-finite samples throw `INPUT_NAN`.

**Exit.** Ten frames of output latency at 44.1 kHz delay the bus by 10 samples. The first sample is 0 and sample 10 is the capture. The silent bus peaks at 0. Browsers report delay 10, monitor 0, and a bus peak above 0.2 without prompting.

## Slice 15 — Hosted models

**Goal.** A configured provider can complete a prompt. Tests and the default agent never open a socket.

**Scope.** `TOOLPA_MODEL_PROVIDER` selects `mock`, `vercel-gateway`, `cloudflare-gateway`, `openai-compatible`, or `ollama`. Gateways are the primary hosted path. Vercel uses `AI_GATEWAY_API_KEY` and model ids such as `anthropic/claude-haiku`. Cloudflare uses `CF_AIG_TOKEN`, `CF_ACCOUNT_ID`, and `CF_GATEWAY_ID` on the universal `/compat/chat/completions` endpoint. Direct OpenAI-compatible chat and Ollama stay available. A direct Anthropic Messages call remains as well. A call happens only when `allowNetwork` is true, which `TOOLPA_ALLOW_NETWORK=1` sets. Tests stub `fetch` or pass a transport. `MockModel` remains the default. `RemoteModel` and `RemotePromptProvider` with no complete function still throw `NOT_CONFIGURED`. The prompt path reads `midi:step:velocity` tokens. The agent path reads device ids from the same completion. The key stays in a header and out of the body, the URL, the trace, and the provenance. Configuration is in `docs/hosted-models.md`.

**Exit.** The same rack hash comes back from the direct response shapes and from a Cloudflare gateway stub. A Vercel stub returns two note tokens. A blocked provider does not call `fetch`. Browsers report both gateway URLs and still report `NOT_CONFIGURED` for the unwired classes.

## Slice 16 — Authoring parity

**Goal.** A patch written as JSX, as a line DSL, or as JSON is one document.

**Scope.** The JSX factory is `ir`. A graph has one output node, and children are inputs. The DSL is `graph`, node lines, and `out`. JSON is the same object. `parseIr` stamps the FNV graph hash and the SHA-256 document id. Parsing the stamped graph again keeps both.

**Exit.** The tone patch (a 440 const into a cycle) has one document id and one graph hash from all three forms, and from the stamped round trip. Browsers report `same` and two nodes.

## Slice 17 — Cookbook

**Goal.** Forty named patches load through the IR and render to a pinned digest.

**Scope.** The docs bundle did not include the upstream `dsp-patches` JSON files. These forty are canonical IR graphs: sines, band-limited saws and squares, triangles, seeded noise, lowpass tones, and two-note intervals. Each one parses, lowers to Elementary, and renders 128 frames at 44.1 kHz. The golden is the SHA-256 of the forty buffer hashes joined in order.

**Exit.** The count is 40, the names are unique, the buffer hashes are unique, the quietest peak is above 0.01, and the digest is `c75d8acc8171858d0373456c916877e4c1d3bd20758951c6dcc60dd2e3f0d1f0`. A second render matches. Browsers report the same digest.

## Slice 18 — Live performance

**Goal.** A set of scenes can be selected, a macro can learn a control change, and a launch waits for the next quantum. An xrun is recorded.

**Scope.** `quantizeLaunch(1.2, 1)` is beat 2. An exact bar stays on that bar. Learn arms one parameter and the next CC binds it. Launch requires a selected scene. `performance.xrun` records underruns and output latency. The performance page has scene, learn, CC, launch, and xrun buttons.

**Exit.** The unit test records scene, learn, launch, and xrun. Browsers click the buttons and the status line reads `launch scene-a 2` and `xrun 1`. The existing clip playback test still hears a peak.

## Slice 19 — Storage

**Goal.** An index lives in IndexedDB. Blobs live in OPFS, or in IndexedDB when OPFS does not open.

**Scope.** `DurableStore` tries OPFS for two seconds. If that throws or times out, blobs go to IndexedDB. The index records the backend with the id. Save, load, samples, and parent walks use that record. The playground and the storage probe both open `DurableStore`. WebKit storage is gating.

**Exit.** A memory stand-in for IndexedDB saves and loads one artifact and one sample. Chromium, Firefox, and WebKit each keep a parent pointer and the sample bytes. The playground Save button enables on WebKit.

## Slice 20 — Playground studio

**Goal.** The playground can browse devices, order a rack, edit a clip on a piano roll, and export stems, MIDI, SFZ, and a sample pack.

**Scope.** The catalog is keys, a sine instrument, and a lowpass. Compose uses the slice 5 rack rules, so an effect before the instrument is rejected. The roll is eight steps by eight notes. Export calls `writeSmf`, `writeSfz`, `renderStems`, and `writeSamplePack`. WAV 16-bit, 24-bit, and float stay on the existing render buttons.

**Exit.** A legal rack returns a 64-character hash and an illegal order returns `RACK_ORDER`. MIDI bytes start with `MThd`. The sample pack lists `instrument.sfz`. Chromium, Firefox, and WebKit click through the browser, the roll, and each export.

## Slice 21 — Prompt to instrument

**Goal.** Typing a prompt in the playground generates a playable instrument.

**Scope.** The browser posts only to `/api/agent` on its own origin. The Vite middleware and `apps/playground/api/agent.ts` read the gateway env and call `GatewayProvider`. Cloudflare sends `CF_AIG_TOKEN` on both `cf-aig-authorization` and `Authorization`. The default model is `workers-ai/@cf/openai/gpt-oss-120b`, overridable with `TOOLPA_MODEL`. Reply text uses `message.content` and ignores `reasoning`. JSON may be wrapped in prose or a code fence. A 403 or 410 from the model is shown on the page. With no gateway env, the proxy says so and uses `MockModel`. The agent builds a canonical prompt-instrument from oscillators, envelopes, filters, LFOs, effects, and the sampler, with the 40 cookbook names as few-shot examples. Validation or a silent, clipping, or NaN render repairs the document within `maxAttempts`. The result loads into the piano roll, plays from the computer keyboard or Web MIDI, and can be saved as `.toolpa`. Earlier generations stay in the page history.

**Exit.** Repair tests cover silence, clipping, NaN, the attempt budget, and 403. The proxy test checks both Cloudflare headers and the default model id without a socket. Chromium, Firefox, and WebKit type a prompt against a stubbed proxy, hear the rack, and show a 403.

## Slice 21.1 — Configured provider on the prompt panel

**Goal.** A configured gateway is visible before Generate, and a slow model call does not look stuck on the first plan line.

**Scope.** `GET /api/agent/status` uses the same resolver as the agent. The page shows that notice on load. The first `plan` stage carries the provider label. The response is `application/x-ndjson` with `Cache-Control: no-cache` and `X-Accel-Buffering: no`, and each line is flushed. A heartbeat every 2 seconds says `waiting for model (Ns)` while the model call is open. The browser stops the request after 90 seconds with a timeout error. The Vite server logs the request, each stage, and the upstream status, and does not log the token.

**Exit.** The status for a Cloudflare env is `cloudflare-gateway` and configured. A delayed transport emits a wait line and an upstream 200. A thrown 403 is logged as upstream 403. Chromium, Firefox, and WebKit show a stubbed Cloudflare notice and do not show the mock fallback.

## Slice 22 — Real prompt to instrument

**Goal.** The model’s JSON is the instrument. A failed model call is shown as a failure.

**Scope.** Chat completions ask for at least 4096 tokens (`TOOLPA_MAX_TOKENS` can raise it). `gpt-oss` gets `reasoning_effort: low`. Workers AI uses `response_format: json_object`; other OpenAI-compatible calls can use `json_schema`. Extraction still accepts fenced or prose-wrapped JSON. The log records `finish_reason` and content length, not the token. Parse and model errors are sent back to the model. They never become a canned patch. If every attempt fails, the page shows the error and does not load an instrument. Silence, clipping, and NaN can still change levels, cutoff, and effect mix, and the page labels that Auto-adjusted. The document has voices, up to three oscillators, amp and filter envelopes, LFOs, glide, an ordered effect chain, and macros. It lowers through the slice 10 and 11 nodes. `pnpm toolpa eval-prompts` calls the configured model only when `TOOLPA_ALLOW_NETWORK=1` and writes `tmp/prompt-eval.json`.

**Exit.** Two stubbed prompts hash differently. A model that never returns JSON ends in `AGENT_BUDGET` after real retries. A Cloudflare request for `gpt-oss` includes `max_tokens` of at least 4096 and `reasoning_effort: low`. Chromium, Firefox, and WebKit play a generated lead, show its name and description, and move a macro knob.

## Follow-ups that are not slices

- Slice 1 kept SHA-256 of the canonical chain document on purpose; the IR adds FNV beside it. The upstream cookbook JSON was not in the docs bundle, so slice 17 ships forty canonical patches instead of byte copies.
- Tone remains the slice 1 chain effect. The new effects are a separate document.
- A physical MIDI port on the CI machine, and a package registry publish. Hosted models are slice 15. Gateways are the primary path and stay off unless `TOOLPA_ALLOW_NETWORK=1`. Microphone capture is slice 14. `openMicrophone()` with no arguments still refuses so older tests do not prompt.
