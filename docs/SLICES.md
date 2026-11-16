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

## Follow-ups that are not slices

- The 40-patch cookbook. Slice 1 kept SHA-256 of the canonical chain document on purpose; the IR adds FNV beside it.
- JSX, DSL, and JSON authoring parity. Agents and the playground emit data.
- Tone remains the slice 1 chain effect. The new effects are a separate document.
- A hosted chat model, a physical MIDI port, microphone capture, and a package registry publish.
