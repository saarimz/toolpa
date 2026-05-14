# ai-daw-tools

`ai-daw-tools` is an AI-native instrument framework for the browser.

The project is not just a collection of music toys. It is a modular workstation
for generating, inspecting, playing, exporting, and rebuilding instruments whose
behavior is described by typed manifests and serializable musical documents.

The mental model is a modular rig:

- A hardware modular rig is built from oscillators, samplers, sequencers,
  filters, VCAs, modulation sources, patch cables, panels, and power rails.
- `ai-daw-tools` is built from manifests, document schemas, prompt surfaces,
  AI builders, sample libraries, audio engines, FX slots, export adapters,
  route conventions, registries, and verification gates.
- A generated instrument is not an opaque model response. It is a real route in
  the workstation with a manifest, UI, playable audio path, inspectable saved
  document, export contract, tests, and registration metadata.

The long-term goal is to make it possible to build an entire workstation of AI
instruments: sample manglers, synths, MIDI generators, effects, hybrid
sample-informed synths, microtonal pattern machines, analysis tools, and future
instrument families that all speak a shared platform language.

## Table Of Contents

- [Start Here](#start-here)
- [What This Framework Is](#what-this-framework-is)
- [Core Model](#core-model)
- [Architecture Map](#architecture-map)
- [Routes And Product Surfaces](#routes-and-product-surfaces)
- [Agent Manifests](#agent-manifests)
- [Musical Documents](#musical-documents)
- [L1 Instruments](#l1-instruments)
- [L2 Builders](#l2-builders)
- [Generated Tool Contract](#generated-tool-contract)
- [AI Generation Architecture](#ai-generation-architecture)
- [Audio Architecture](#audio-architecture)
- [FX Architecture](#fx-architecture)
- [Sample Library And Analysis](#sample-library-and-analysis)
- [MIDI And Export Architecture](#midi-and-export-architecture)
- [Dashboard And Audits](#dashboard-and-audits)
- [Prompt-First UI Contract](#prompt-first-ui-contract)
- [Verification Gauntlet](#verification-gauntlet)
- [Deployment Model](#deployment-model)
- [Development Commands](#development-commands)
- [How To Extend The Framework](#how-to-extend-the-framework)
- [Glossary](#glossary)

## Start Here

The full builder workflow needs a local writable checkout. Vercel is suitable
for a frozen/demo viewer of tools that are already committed to the repo, but
the current builder writes source files, snapshots, and registry metadata.

Run the app locally:

```bash
cd ai-daw-tools
corepack enable
corepack prepare pnpm@10.26.2 --activate
cp .env.example .env.local
# Add AI_GATEWAY_API_KEY=... to .env.local
pnpm install --frozen-lockfile
pnpm dev --port 3010
```

Open:

```text
http://localhost:3010/dashboard
```

Use `pnpm dev --port 3010` for creating or rebuilding generated tools. The
builder writes new source files under `app/tools/<slug>/`, rewrites
`.audit/generated-tools.json`, snapshots generated tools, and runs verification
commands before registration.

For local production playback of tools already in the checkout:

```bash
pnpm build
pnpm start --port 3010
```

Production playback is good for the currently committed tools. For brand-new
generated routes, use dev mode while building them, or rebuild and restart after
the generated tool has been written.

## What This Framework Is

`ai-daw-tools` is a framework for building browser instruments with AI as an
instrument-design collaborator.

The framework gives each instrument:

- A validated identity: name, slug, level, origin, route, status, autonomy, and
  declared capabilities.
- A declared musical family: sample, synth, hybrid, effect, MIDI, or builder.
- A saved document format: Pattern, SynthScene, MidiClip, audio-stream patch, or
  generated files.
- A prompt-first control surface that makes AI generation the first meaningful
  creative gesture.
- A real Web Audio or MIDI output path.
- A record/export path where the generated result can leave the browser.
- A registry and audit trail so generated instruments are not silently detached
  from the workstation.
- A verification path that proves the tool can render, typecheck, test, and
  produce finite audible output where audio is expected.

The framework is intentionally instrument-centered. The unit of work is not
"call a model and play a sound"; the unit of work is "create a reusable musical
module with a stable contract."

### Why Manifests And Documents Matter

AI can generate code, parameters, sequences, patches, and descriptions. Without
a framework, those outputs become hard to trust:

- A prompt response may not map to a playable audio graph.
- A generated UI may not expose the underlying music.
- A synth patch may exist only in transient Web Audio nodes.
- An instrument may work once but fail after reload.
- A generated tool may appear in the app without tests, exports, or registration.

This repo solves that by making each instrument explain itself in code.
`AgentManifestSchema` declares what the tool is. Pattern, SynthScene, MidiClip,
and audio-stream contracts declare what the tool produces. The dashboard and
audit layers read those declarations and decide whether the tool belongs in the
workstation.

### The Modular Rig Analogy

The framework pieces line up with a modular system:

| Modular rig concept | ai-daw-tools concept |
| --- | --- |
| Module panel | `/tools/<slug>` route and React client |
| Module label | `app/tools/<slug>/manifest.ts` |
| Patch cable | Serializable document passed between UI, engine, export, and tests |
| Sequencer | Pattern, SynthScene, or MidiClip document |
| Oscillator / sampler / processor | Web Audio and Tone.js engine code |
| Rack power and clock | Shared audio bootstrap, Tone transport, global BPM/key/scale context |
| Utility module | Shared SamplePicker, FX slots, ToolExportPanel, AudioOutputRecorder |
| Builder module | L2 routes under `/build` |
| Calibration procedure | Manifest validation, static audit, typecheck, unit tests, audio gate |
| Preset memory | JSON document, export artifact, generated registry, snapshots |

The result is a system where AI can help design new modules, but every module
still has to fit the rack.

## Core Model

The platform has two levels.

| Level | Meaning | Routes |
| --- | --- | --- |
| L1 | Playable AI-native instruments, effects, analyzers, and generators | `/tools/<slug>` |
| L2 | Builders that generate or rebuild L1 tools | `/build`, `/build/sample`, `/build/synth`, `/build/effect`, `/build/hybrid`, `/build/microtonal` |

There is no higher builder tier in the product. `AgentManifestSchema` accepts
only `level: 1` and `level: 2`.

### Current Runtime Inventory

The runtime registry currently resolves:

| Count | Value |
| --- | --- |
| Total manifests | 17 |
| L1 tools | 11 |
| L2 builders | 6 |
| Installed manifests | 15 |
| Generated manifests | 2 |
| Instrument types | builder 6, sample 5, synth 3, effect 1, midi 1, hybrid 1 |
| Document types | files 6, pattern 4, synth-scene 3, audio-stream 3, midi-clip 1 |

Those counts come from `getAgentManifests()` in `lib/agents/registry.ts`, which
merges the generated registry with in-tree manifests.

### Framework In One Flow

```text
brief / prompt
  -> L2 builder or L1 generator
  -> validated musical document
  -> instrument UI state
  -> playback engine
  -> export / recording / registry
  -> tests and audits prove the contract still holds
```

For L1 instruments, AI usually generates or edits a musical document.

For L2 builders, AI generates or edits the source code of an L1 instrument, but
the write path is sandboxed and registration is gated.

## Architecture Map

Important directories and files:

```text
app/
  dashboard/
    page.tsx                         Dashboard server page.
    tool-suite-dashboard.tsx         Catalog, filters, health, rebuild links.
  build/
    page.tsx                         General create/rebuild builder surface.
    [domain]/page.tsx                Specialized builder surfaces.
  api/
    build/handler.ts                 L2 create stream.
    build/edit/handler.ts            L2 rebuild stream.
    generate/handler.ts              Pattern generation.
    synth/handler.ts                 SynthScene generation/evolution.
    sample-analysis/handler.ts       AI descriptors and production-use ideas.
    analyze-upload/handler.ts        Node-side upload analysis.
    suggestions/handler.ts           Prompt suggestions.
  tools/
    <slug>/
      manifest.ts                    Tool identity and capability contract.
      page.tsx                       Route entry.
      client.tsx                     Playable UI.
      render.ts                      Offline renderer where applicable.
      *.test.ts(x)                   Unit coverage.
      render.audio.test.ts           Browser audio gate for generated tools.

components/
  audio-bootstrap.tsx                Browser audio startup boundary.
  audio-output-recorder.tsx          Shared output recording.
  sample-picker.tsx                  Shared sample/library/upload selector.
  tool-export-panel.tsx              Shared artifact export surface.
  fx-slot-panel.tsx                  Shared A/B/C/D FX control panel.
  music/global-music-controls.tsx    Shared BPM/key/scale workstation controls.

lib/
  agents/
    contract.ts                      AgentManifestSchema.
    registry.ts                      Runtime manifest registry.
    manifest-source.ts               In-tree manifest reader.
    generated-registry.ts            .audit/generated-tools.json reader/writer.
    generated-audit.ts               Generated tool health audit.
    platform-hardening.ts            L1/L2 platform contract audit.
    builder-contracts.ts             Build request/stream schemas.
    builder-tools.ts                 Builder tool functions and registration.
    builder-profiles.ts              Specialized L2 builder domains.
    sandbox.ts                       Generated-tool write boundary.
    templates/                       Canonical generated L1 skeletons.
  ai/
    gateway.ts                       AI Gateway model configuration.
    pattern-generation.ts            Pattern generation helpers.
    synth-generation.ts              SynthScene generation helpers.
    grid-tool-agent.ts               Grid/sample tool agent helpers.
    sample-context.ts                Sample context for prompts.
  audio/
    pattern-engine.ts                Live Pattern playback engine.
    wav-render.ts                    Offline Pattern WAV rendering.
    synth-wav-render.ts              Offline SynthScene rendering.
    fx-manifest.ts                   Shared FX manifest and FX slot schema.
    fx-chain.ts                      Runtime FX graph construction.
    offline-analysis.ts              Audio gate measurements.
    transport-owner.ts               Shared Tone transport ownership.
  pattern/
    schema.ts                        Pattern document contract.
    url-codec.ts                     Pattern URL serialization.
  midi/
    export.ts                        Standard MIDI File encoder.
    synth-scene.ts                   SynthScene-to-MIDI export.
  music/
    context.ts                       Global BPM/key/scale schemas.
    scale-catalog.ts                 Scales and microtonal tuning catalog.
  samples/
    library.ts                       Static library contract.
    curated-suite.ts                 Curated committed samples.
    storage.ts                       IndexedDB upload storage.
    resolver.ts                      Library/upload sample resolution.
    analysis/                        DSP, Essentia, cache, and schema.
  tool-exports/
    contract.ts                      Export strategy declarations.
    adapters/                        Pattern, SynthScene, MidiClip, audio adapters.

.audit/
  generated-tools.json               Generated manifest registry.
  snapshots/<slug>/                  Accepted generated file snapshots.
```

## Routes And Product Surfaces

The app is centered on `/dashboard`. That page is the workstation rack: it
shows installed L1 instruments, generated L1 instruments, and the specialized L2
builders used to create or rebuild L1s.

Primary routes:

- `/dashboard`: catalog, global music context controls, installed/generated/L2
  filters, generated-tool audit summary, platform-hardening summary, rebuild
  links, and gateway status.
- `/tools/<slug>`: playable L1 instruments and effects.
- `/build`: general L2 builder for creating or rebuilding generated L1 tools.
- `/build/sample`: specialized sample-pattern L2 builder.
- `/build/synth`: specialized SynthScene L2 builder.
- `/build/effect`: specialized audio-stream effect L2 builder.
- `/build/hybrid`: specialized sample-informed synth L2 builder.
- `/build/microtonal`: specialized microtonal sample-pattern L2 builder.

Important API routes:

- `/api/build`: streams L2 create work as NDJSON chunks.
- `/api/build/edit`: streams L2 rebuild work as NDJSON chunks.
- `/api/generate`: pattern generation stream for sample-pattern tools.
- `/api/synth`: SynthScene generation and evolution.
- `/api/analyze-upload`: server-side WAV analysis path.
- `/api/sample-analysis`: AI descriptor and production-use idea enrichment.
- `/api/suggestions`: prompt suggestion endpoint.

## Agent Manifests

Every tool lives or dies by its manifest.

The manifest is the module label, capability declaration, routing contract,
document declaration, and audit target. It lets the platform reason about tools
without hand-inspecting every UI file.

The schema lives in `lib/agents/contract.ts`.

Core fields:

| Field | Meaning |
| --- | --- |
| `name` | Human label for the tool. |
| `slug` | Route and registry identity. L1 routes must be `/tools/<slug>`. |
| `level` | `1` for instruments, `2` for builders. |
| `origin` | `installed` for committed platform tools, `generated` for L2-created tools. |
| `description` | Product description of the instrument or builder. |
| `route` | Route where the tool mounts. |
| `instrument.type` | `sample`, `synth`, `hybrid`, `effect`, `midi`, or `builder`. |
| `instrument.workflow` | More specific workflow label such as `sample-pattern` or `synth-scene`. |
| `instrument.document` | Saved output contract: `pattern`, `synth-scene`, `midi-clip`, `audio-stream`, or `files`. |
| `instrument.usesSamples` | Whether the tool consumes sample library or upload sources. |
| `instrument.usesSynthesis` | Whether the tool creates sound through synthesis. |
| `capabilities` | Feature flags such as `generatePattern`, `fxSlots`, `exportMidi`, `recordOutput`, `verifyTool`. |
| `inputs` | Declared input needs: prompt, samples, BPM, global context, scale search, description, reference agent. |
| `musicContext` | Whether the tool participates in global BPM, key, and scale. |
| `outputs` | Declared outputs: Pattern, SynthScene, MIDI, audio, recording, files, manifest. |
| `exports` | Portable artifact strategy for audio and MIDI. |
| `fx` | Optional shared FX slot declaration. |
| `autonomy` | `manual`, `assist`, or `driven`. |
| `status` | `enabled`, `disabled`, or `coming-soon`. |

### L1 Manifest Rules

L1 tools must:

- Mount at `/tools/<slug>`.
- Be playable instruments, effects, analyzers, or generators, not file builders.
- Expose prompt input for AI-native generation.
- Declare the output matching their document type.
- Declare audible Web Audio output when they produce sound.
- Expose recording output and the `recordOutput` capability.
- Opt into the required shared music context for their instrument type.
- Avoid descriptions that read like builder tasks.

SynthScene L1 tools must also declare MIDI output and `exportMidi` unless they
are continuous live synths such as `camera-theremin`.

### L2 Manifest Rules

L2 tools must:

- Mount under `/build`.
- Use `instrument.type = "builder"` and `instrument.document = "files"`.
- Accept description and reference-agent inputs.
- Output generated files and a manifest.
- Include `verifyTool` and `registerTool` capabilities.
- Use specialized slugs like `_<domain>-builder` for domain builders.

## Musical Documents

The document is the patch cable between AI, UI, audio, export, tests, and
future tools. It is the thing the AI produces that can be validated and replayed.

The current document families are:

| Document | File | Used for |
| --- | --- | --- |
| `pattern` | `lib/pattern/schema.ts` | Sample sequencing, slicing, grid traversal, drum machines, microtonal sample patterns. |
| `synth-scene` | `app/tools/evolving-fm-synth/lib/schema.ts` | Multi-voice synth scenes, FM/wavetable patches, macro evolution, MIDI export. |
| `midi-clip` | `app/tools/midi-generator/lib/schema.ts` | Discrete MIDI notes, tracks, channels, pitch bend, CC data, long-form MIDI generation. |
| `audio-stream` | Manifest/document convention plus tool-local patch schemas | Effects, analysis, time-stretching, live input or rendered audio transformation. |
| `files` | L2 builder output | Generated source files and manifests. |

### Pattern

`PatternSchema` is the core sample-sequencing document.

It contains:

- `bpm`, `swing`, `bars`, and `stepsPerBar`.
- Tracks with `sampleId`, role, slot, choke group, gain, pan, mute, and solo.
- Steps with active state, velocity, probability, micro shift, pitch semitones,
  optional `pitchCents`, optional `tuningRef`, playback rate, decay, reverse,
  repeats, and conditions such as `everyN`, `firstOfN`, and `notFirstOfN`.
- Metadata that records source samples, creator, rationale, and tags.

Pattern tools can render to live playback through `PatternEngine` and to WAV
through `lib/audio/wav-render.ts`.

### SynthScene

`SynthSceneSchema` is the core synth document.

It contains:

- Global musical settings: BPM, swing, key, scale, bars, steps per bar, seed.
- Macro controls: evolution, mutation depth, brightness, dub space, density,
  and analog drift.
- Effects: filter, delay, reverb, chorus, drive, and master level.
- Voices with roles such as bass, chord, stab, lead, and texture.
- Voice patches with partials, root waveform, modulation index, harmonicity,
  modulation wave, detune, and envelopes.
- Steps with MIDI note, tuning cents, velocity, probability, length, micro shift,
  modulation shift, and partial morph.
- Metadata for prompt, rationale, influences, agent plan, and research basis.

SynthScene tools can render live sound, offline WAV artifacts, and Standard MIDI
files when the timeline is discrete.

### MidiClip

`MidiClipSchema` is the dedicated MIDI document.

It contains:

- BPM, swing, key, scale, bars, beats per bar, steps per bar, and seed.
- Tracks with role, channel, and mute state.
- Notes with MIDI pitch, start beat, duration, velocity, channel, pitch-bend
  cents, and optional CC events.
- Generation mode and style profile metadata.

The MIDI generator uses this to create long-form Standard MIDI files while also
offering a simple sine preview so the clip can be auditioned in the browser.

### Audio Stream

`audio-stream` is used for tools whose primary artifact is audio transformation
or audio analysis rather than a note grid. Examples include:

- `sample-analysis`, which measures and annotates an audio source.
- `time-stretch`, which renders a stretch/freeze/bloom patch over a sample.
- generated effects such as `harmonic-distrotion-effect`, which declare an
  audio-stream effect patch and recordable output.

Audio-stream tools still need explicit manifests, bounded controls, and export
contracts. They should not pretend to be Pattern or SynthScene tools.

## L1 Instruments

Installed L1 tools live under `app/tools/<slug>/` and export a validated
`agentManifest`.

Current installed L1 surfaces:

| Tool | Type | Document | What it is |
| --- | --- | --- | --- |
| `intelligence-sampler` | sample | pattern | Prompt-assisted sample slicing and patterning. |
| `splice-lab` | sample | pattern | Multi-source interleaving and rhythmic splice loops. |
| `grid-sampler` | sample | pattern | Directional 2D sample-grid traversal. |
| `drum-machine` | sample | pattern | Probability and condition driven one-shot sequencing. |
| `evolving-fm-synth` | synth | synth-scene | Prompted FM/wavetable scenes, macro editing, WAV render, MIDI export, FX slots. |
| `camera-theremin` | synth | synth-scene | Prompt-selectable hand, gesture, face, eye, and body tracking mapped into a scale-locked continuous synth. |
| `sample-analysis` | sample | audio-stream | Upload/library analysis with DSP features, AI descriptors, production ideas, and audition. |
| `midi-generator` | midi | midi-clip | Prompt-driven MIDI clips with global context sync, sine preview, visualization, and Standard MIDI export. |
| `time-stretch` | hybrid | audio-stream | Prompted sample stretching, spectral freeze, subharmonic bloom, render, and recording. |

Current generated L1 examples:

| Tool | Type | Document | What it proves |
| --- | --- | --- | --- |
| `sine-wave-synth` | synth | synth-scene | Generated SynthScene tool with audio and MIDI export. |
| `harmonic-distrotion-effect` | effect | audio-stream | Generated effect tool with audio-stream patch and recording/export path. |

Generated examples follow the same route and manifest contract as installed L1
tools after they pass the generated-tool registration gates.

## L2 Builders

L2 builders are instrument factories. They are not user-facing synths; they are
workflows that create or rebuild L1 instruments.

The general builder is `/build`. Specialized builder profiles live in
`lib/agents/builder-profiles.ts` and mount at:

- `/build/sample`
- `/build/synth`
- `/build/effect`
- `/build/hybrid`
- `/build/microtonal`

Each profile constrains:

- Target instrument type.
- Target document type: `pattern`, `synth-scene`, or `audio-stream`.
- Target workflow label.
- Primary reference tool.
- Secondary reference tools.
- Template kit.
- Generated manifest requirements.
- Verification gates.
- Sandbox root.
- Music context expectations.
- Domain-specific constraints.

The specialized profiles make the framework feel less like "ask an LLM to make
anything" and more like "patch a specific builder module into the rack."

### Builder Domains

| Builder | Route | Target | Document | Reference |
| --- | --- | --- | --- | --- |
| General builder | `/build` | sample, synth, effect, or hybrid | inferred | chosen from request |
| Sample Pattern Builder | `/build/sample` | sample | pattern | `intelligence-sampler`, with `splice-lab`, `drum-machine`, `grid-sampler` as secondary references |
| Synth Scene Builder | `/build/synth` | synth | synth-scene | `evolving-fm-synth` |
| Audio Stream Effect Builder | `/build/effect` | effect | audio-stream | `evolving-fm-synth`, `splice-lab` |
| Sample-Informed Synth Builder | `/build/hybrid` | hybrid | synth-scene | `evolving-fm-synth`, `intelligence-sampler` |
| Microtonal Sample Builder | `/build/microtonal` | sample | pattern | `intelligence-sampler`, `evolving-fm-synth` |

### Create Flow

The create path is:

1. User opens `/build` or a specialized builder route.
2. Client posts a `BuildToolRequest` to `/api/build`.
3. `handleBuildRequest` validates the request with `BuildToolRequestSchema`.
4. `runBuilderToolLoopAgent` starts a tool-loop agent through the AI Gateway.
5. The agent reads the tool list, reads reference tool files, reads schemas,
   instantiates a skeleton, edits files in the sandbox, and runs gates.
6. The server validates the manifest again.
7. If registration is enabled, `registerTool` runs the full verification
   gauntlet and updates `.audit/generated-tools.json`.
8. The UI receives NDJSON chunks for decisions, tool calls, files, manifest,
   verification, completion, or errors.

### Rebuild Flow

The rebuild path is:

1. `/dashboard` links generated tools to `/build?edit=<slug>`.
2. `/build` preloads the registry manifest and opens rebuild mode.
3. The client posts a `BuildToolEditRequest` to `/api/build/edit`.
4. `runBuilderEditAgent` reads the existing generated tool and edits inside the
   existing tool sandbox.
5. The agent does not instantiate a new skeleton and does not change the slug.
6. The server validates the manifest, runs the static audit, typecheck, tests,
   browser audio gate, snapshots files, updates the registry, and streams
   verification chunks back to the UI.

Registration is not left solely to the model. The server re-validates and
re-registers after a successful create or edit when registration is enabled. The
model can write files only through the sandbox; `.audit/generated-tools.json` is
rewritten server-side from the validated manifest.

## Generated Tool Contract

Generated tools must be rebuildable from source and registry metadata.

Every generated L1 should have:

- `app/tools/<slug>/manifest.ts`
- `app/tools/<slug>/page.tsx`
- `app/tools/<slug>/client.tsx`
- `app/tools/<slug>/render.ts` exporting `renderOffline(document, durationSec)`
  where offline audio verification is expected.
- `app/tools/<slug>/render.audio.test.ts` exercising the browser audio gate.
- At least one colocated `*.test.ts` or `*.test.tsx`.
- A registry entry in `.audit/generated-tools.json`.
- A snapshot under `.audit/snapshots/<slug>/` after registration.
- A route matching `/tools/<slug>`.
- A valid `AgentManifestSchema` with `origin: "generated"` and `level: 1`.
- Manifest `exports` for declared audio and MIDI outputs.
- A prompt-first UI layout.
- A visible document/artifact path, not only hidden sound generation.

Generated tools are accepted only when their code, manifest, route, tests,
audio gate, and registry metadata line up.

## AI Generation Architecture

AI enters the platform through bounded contracts.

The default AI Gateway model is:

```bash
AI_GATEWAY_MODEL=deepseek/deepseek-v4-flash
```

Set `AI_GATEWAY_API_KEY` in `.env.local`, or use Vercel OIDC auth in
deployment.

Gateway configuration lives in `lib/ai/gateway.ts`.

AI is used in several distinct modes:

- L1 document generation: create or mutate Pattern, SynthScene, or MidiClip
  documents from prompts.
- L1 contextual suggestions: use sample metadata, analysis summaries, global
  context, and prompt history to suggest useful musical directions.
- L1 descriptor enrichment: annotate measured audio analysis with human-facing
  timbre, mood, genre, and use-case descriptors.
- L2 source generation: generate or edit L1 instrument source files inside a
  sandbox, then run the verification gauntlet.

### Local Fallbacks

AI is important, but the platform should not become silent when the model path
fails. Several L1 tools keep deterministic local generation paths so the UI can
remain playable through gateway timeouts or missing keys.

For example:

- SynthScene tools preserve a playable local scene when gateway enhancement
  fails.
- Sample tools can keep measured analysis and local playback independent of
  descriptor enrichment.
- MIDI generation has a structured schema and preview path that can be tested
  without depending on the model.

### Prompt Context

Good generated output depends on giving the model musical context instead of
asking for unbounded text.

Common context sources:

- Global BPM, swing, key, scale, and reference frequency.
- Selected library sample metadata.
- Upload or library sample analysis.
- Active Pattern, SynthScene, MidiClip, or patch document.
- Instrument manifest capabilities.
- Reference tool files for L2 builds.
- Builder profile constraints and verification gates.

## Audio Architecture

The audio layer is split by document type.

### Pattern Playback

`PatternEngine` in `lib/audio/pattern-engine.ts` is the main sample-pattern
playback layer.

It:

- Uses Tone.js and a shared Tone transport.
- Resolves sample IDs through the sample resolver.
- Builds Tone parts from serialized Pattern events.
- Handles probability, conditional steps, pitch, reverse, repeats, choke
  groups, gain, pan, swing, and micro-shift style timing.
- Supports live pattern updates by replacing Tone parts while keeping the output
  graph when compatible.
- Owns output through `createToneFxGraph()`.
- Publishes playback trace events for UI inspection.
- Uses `transport-owner` to prevent one engine from stopping Tone transport
  while another engine is active.

Pattern export uses `lib/audio/wav-render.ts` and
`lib/tool-exports/adapters/pattern.ts`.

### Synth Playback

Synth paths are centered on SynthScene data.

`evolving-fm-synth` is the reference installed synth:

- Prompt and local generation create SynthScene documents.
- The UI exposes macro editing and visible voice/step state.
- Playback turns voices and steps into Web Audio/Tone scheduling.
- `lib/audio/synth-wav-render.ts` renders scenes offline for WAV export.
- `lib/midi/synth-scene.ts` converts active discrete steps to Standard MIDI.
- Shared FX slots can be applied to live and offline render paths.

`camera-theremin` is intentionally different. It is a continuous performance
synth controlled by MediaPipe tracking, so it records live audio instead of
claiming a stable MIDI timeline.

### Audio-Stream Tools

Audio-stream tools process or analyze audio instead of representing a discrete
note grid.

They should:

- Keep patch parameters bounded and serializable.
- Expose live or rendered audio output.
- Expose recording or WAV export where appropriate.
- Avoid pretending their output is Pattern or SynthScene unless they actually
  emit that document type.

### Browser Audio Rules

Browser audio has platform constraints:

- Audio should start from an explicit user action.
- Scheduled callbacks should use the audio-context time passed to the callback.
- Web Audio nodes should be created inside client/runtime paths, not as unsafe
  module-level side effects.
- Generated tools should keep audio graph, UI state, and saved document
  contracts explicit.

The platform encodes these rules through shared components, static audits, and
browser audio tests.

## FX Architecture

FX are shared framework modules, not per-tool one-off state.

The FX manifest lives in `lib/audio/fx-manifest.ts`.

It defines:

- FX slot IDs: `A`, `B`, `C`, `D`.
- Effect kinds such as repeat, chorus, delay, reverb, reverse reverb, Yamaha
  SPX-style algorithms, FX500-style chains, Motif-style effects, A3000-style
  degradation, and E-mu-style morphing.
- Effect families, tags, models, parameter manifests, defaults, and wet amounts.
- Probability automation for slot wetness over time.
- `FxPatternSchema`, the serializable state for a tool's FX slots.

Runtime graph construction lives in `lib/audio/fx-chain.ts`, and shared UI lives
in `components/fx-slot-panel.tsx`.

Generated tools should use the shared FX contract instead of inventing their own
unbounded effect state.

## Sample Library And Analysis

Sample-facing tools share the `SamplePicker` component and the library contract
in `lib/samples/library.ts`.

The committed library is intentionally curated:

- Base library samples point at committed audio files under `public/samples/**`.
- The curated suite in `lib/samples/curated-suite.ts` adds genre, kind, tags,
  and source-path metadata.
- The app never reads the local archive at runtime. It serves only committed
  `public/samples/**` files.

The curated suite is rebuilt from the local sample archive with:

```bash
pnpm curate:samples
pnpm curate:samples:check
```

By default the script reads:

```text
/Users/saarimzaman/Documents/Audio Samples
```

Use a different archive root with:

```bash
AUDIO_SAMPLES_ROOT=/path/to/archive pnpm curate:samples
```

### Sample Resolution

Samples come from:

- Static public library samples.
- Browser-local uploads stored in IndexedDB through `lib/samples/storage.ts`.

Resolution:

- Library samples are fetched by committed public `href`.
- Uploaded samples are loaded from IndexedDB.
- Decoded `AudioBuffer` promises are cached by the resolver.

### Sample Analysis

Sample analysis starts in `lib/samples/analysis/index.ts`.

The flow:

1. Library samples resolve through `assertLibrarySample(...)`.
2. Uploads are stored in browser IndexedDB.
3. `getSampleSchema(sampleId)` first checks the baked library cache for
   committed library samples.
4. Uploads and uncached samples are loaded as audio bytes and cached by SHA-256
   after analysis.
5. Browser uploads first try `/api/analyze-upload`, which accepts WAV bytes,
   decodes them in Node, and runs the Essentia pipeline.
6. If that server path is unavailable or cannot decode the file, the browser
   falls back to the local Web Audio/DSP pipeline.
7. The DSP output is validated by `SampleAnalysisSchema`.

Measured analysis includes:

- Source format, duration, channels, sample rate, and SHA-256.
- Loudness, true peak, RMS, crest factor, stereo width, silence, and DC offset.
- Spectral centroid, rolloff, flatness, flux, and MFCCs.
- Tonal chroma, key, scale, key strength, and tuning.
- BPM, BPM confidence, beat offset, onsets, onset rate, and swing ratio.
- Envelope data.
- Slice and beat features.
- Inferred role and role confidence.
- Optional model tags.
- Optional LLM descriptors.

`/tools/sample-analysis` deliberately shows measured analysis before AI work.
The client calls `getSampleSchema(..., { enrichDescriptors: false })` for a
fast baseline, then runs descriptor enrichment and production-use ideas
separately.

`/api/sample-analysis` requires the AI Gateway and can run `descriptors`,
`ideas`, or `all`. It annotates the validated analysis instead of replacing the
measured features.

The baked analysis cache lives at `lib/samples/analysis-cache.json` and is
generated from committed public samples:

```bash
pnpm analyze:library
pnpm analyze:library:check
```

The default cache scripts skip MusiCNN so cache generation stays deterministic
and fast enough for normal verification. Use this only when intentionally
rebuilding the library cache with the slower model-tagging path:

```bash
pnpm analyze:library:musicnn
```

## MIDI And Export Architecture

MIDI and audio exports are first-class framework artifacts.

Export declarations live in `lib/tool-exports/contract.ts`.

The platform currently supports:

- `offline-render`: render a document to WAV without requiring a live take.
- `live-recording`: record live browser audio output to WAV.
- `source-audio`: expose source audio where appropriate.
- `standard-midi-file`: export SMF type 1 MIDI with track preservation.

### MIDI

The MIDI framework lives in `lib/midi/`.

- `lib/midi/export.ts` writes deterministic Standard MIDI Files with tempo,
  4/4 timing, note on/off events, velocity, channel assignment, CC data where
  supported, and pitch-bend cents where supported.
- `lib/midi/synth-scene.ts` converts audible active SynthScene steps into MIDI
  notes and provides the browser download helper used by L1 synth surfaces.
- `app/tools/midi-generator/lib/export.ts` converts MidiClip documents into
  MIDI files.
- Synth and hybrid generated-tool templates include MIDI export next to WAV
  export when their document is a discrete SynthScene.

Continuous live gestures such as camera theremin are intentionally not exported
as fake MIDI timelines.

### Tool Export Panel

`components/tool-export-panel.tsx` is the shared artifact surface.

Generated and installed tools should route portable actions through shared
adapters when possible:

- Pattern to WAV: `lib/tool-exports/adapters/pattern.ts`
- SynthScene to WAV and MIDI: `lib/tool-exports/adapters/synth-scene.ts`
- MidiClip to MIDI: `lib/tool-exports/adapters/midi-clip.ts`
- Audio stream/source artifacts: `lib/tool-exports/adapters/audio-stream.ts`

This keeps export behavior aligned with manifest `exports` declarations.

## Dashboard And Audits

`/dashboard` is the primary catalog and health surface.

It provides:

- Primary filters for installed L1 tools, generated L1 tools, and L2 builders.
- Secondary filters by tool type and document type.
- Generated-tool audit status for manifest, route, test, audio gate, export,
  and registry alignment.
- L1/L2 platform-hardening status for prompt input, serializable documents,
  audio/MIDI output, recording, route shape, sandbox, and builder verification
  gates.
- Rebuild links for generated L1 tools through `/build?edit=<slug>`.
- A visible gateway warning when `AI_GATEWAY_API_KEY` or Vercel OIDC auth is not
  configured.
- Global music controls for BPM, swing, key, scale, and reference frequency.

### Runtime Registry

`getAgentManifests()` in `lib/agents/registry.ts` merges:

1. `.audit/generated-tools.json` via `readGeneratedAgentManifests()`.
2. In-tree `app/tools/*/manifest.ts` via `readInTreeAgentManifests()`.

The manifests are keyed by slug and sorted for display.

### Generated Tool Audit

`createGeneratedToolAudit()` in `lib/agents/generated-audit.ts` checks generated
tools against both:

- Registered generated manifests in `.audit/generated-tools.json`.
- In-tree generated manifests under `app/tools/*/manifest.ts`.

With file checks enabled, it verifies:

- The generated tool is registered.
- The in-tree manifest exists.
- Manifest, registry, and route metadata match.
- Prompt input exists.
- The declared document output exists.
- Audio and MIDI export contracts exist when outputs are declared.
- Route file, manifest file, tests, offline renderer, and browser audio gate
  test exist.
- Shared global music context is declared where expected.

### Platform Hardening Audit

`createPlatformHardeningAudit()` in `lib/agents/platform-hardening.ts` checks
all runtime manifests against platform rules.

It encodes these conventions:

- Every L1 exposes a Pattern, SynthScene, MIDI clip, or audio-stream document
  instead of hiding output only inside transient Web Audio nodes.
- Manifest, audio behavior, and UI route stay explicit so generated tools can
  be loaded, inspected, and rebuilt.
- Playable L1s expose bounded prompt/audio controls, recording, and
  user-triggered audio output.
- L2 builders validate manifests, static safety, tests, audio-gate output,
  registry metadata, and sandbox scope before a generated L1 becomes part of
  the suite.
- Prompt controls render immediately after required source/context selectors
  and before playback, transport, export, or deep editing controls.

## Prompt-First UI Contract

All L1 instruments are arranged around prompt-first control order.

Required source or context selectors can appear first. After that, the
tool-specific prompt surface must appear before playback, transport, export, and
deep manual editing controls.

L2 builders follow the same rule with the natural-language build or rebuild
description as the first editing surface.

The reason is product-level, not cosmetic: AI is the creative front panel of the
framework. Manual editing is still important, but it should refine or inspect
the generated document after the prompt creates a musical direction.

## Verification Gauntlet

The project follows the rule: verify before claiming done.

Generated registration is gated in `lib/agents/builder-tools.ts`.

`registerTool()` runs:

1. `validateManifest`: parses `app/tools/<slug>/manifest.ts` through
   `AgentManifestSchema`.
2. `runToolStaticAudit`: checks required files, the client boundary,
   disallowed imports/storage/exfiltration primitives, module-level audio
   construction, and placeholder output.
3. `runToolTypecheck`: runs a scoped per-tool `tsc --noEmit` config.
4. `runToolTests`: runs scoped Vitest unit coverage for the generated tool.
5. `runToolAudioGate`: runs `render.audio.test.ts` in the browser audio project,
   calls `renderOffline`, and analyzes RMS, peak, NaN/Infinity, clipping, and
   duration through `lib/audio/offline-analysis.ts`.
6. `snapshotGeneratedTool`: stores accepted generated files under
   `.audit/snapshots/<slug>/`.
7. `writeGeneratedAgentManifest`: updates `.audit/generated-tools.json`.

The expected result is a generated instrument that is not merely present in the
filesystem but demonstrably loadable, typed, tested, renderable, audible, and
registered.

## Deployment Model

### Local Writable Workstation

The full builder workflow needs a writable project filesystem.

Use local dev mode when:

- Creating generated L1 instruments.
- Rebuilding generated L1 instruments.
- Running L2 builders.
- Updating `.audit/generated-tools.json`.
- Creating `.audit/snapshots/<slug>/`.
- Iterating on new route files under `app/tools/<slug>/`.

Command:

```bash
pnpm dev --port 3010
```

### Frozen Viewer Deployment

Vercel can host a demo/viewer build, but it cannot run the current full builder
workflow. Vercel can bundle and read committed files such as
`.audit/generated-tools.json` and `app/tools/*/manifest.ts`, but serverless
functions do not provide the writable project filesystem and build-time route
updates that the builder needs.

Use these settings for a demo deployment:

- Root directory: this repo.
- Install command: `pnpm install --frozen-lockfile`.
- Build command: `pnpm build`.
- Environment variables: `AI_GATEWAY_API_KEY`, and optionally
  `AI_GATEWAY_MODEL`.
- Treat `/build` as demo-only unless the architecture changes.

To support the builder on Vercel, the app needs a different write/deploy model:

- Write generated tools to GitHub and redeploy from the committed branch.
- Replace source-file-generated tools with a dynamic `/tools/[slug]` renderer
  backed by storage.
- Run the current app on a writable machine/container instead of serverless
  functions.

## Development Commands

Install and run:

```bash
pnpm install --frozen-lockfile
pnpm dev --port 3010
```

Open:

```text
http://localhost:3010/dashboard
```

Focused checks while changing builder or dashboard behavior:

```bash
pnpm test:unit app/dashboard/tool-suite-dashboard.test.tsx app/tools/_builder/client.test.tsx lib/agents/builder-profiles.test.ts lib/agents/generated-audit.test.ts lib/agents/registry.test.ts lib/agents/contract.test.ts app/api/build/edit/handler.test.ts
```

Full repo checks before handoff:

```bash
pnpm test:unit
pnpm typecheck
pnpm lint
```

Audio-gate checks:

```bash
pnpm test:audio
```

Sample library and analysis cache checks:

```bash
pnpm curate:samples:check
pnpm analyze:library:check
```

Build check:

```bash
pnpm build
```

## How To Extend The Framework

### Add A New Installed L1 Instrument

Use this when the instrument is hand-authored platform code rather than an L2
generated tool.

1. Create `app/tools/<slug>/manifest.ts`.
2. Declare `level: 1`, `origin: "installed"`, route `/tools/<slug>`, instrument
   type, document type, inputs, outputs, exports, music context, capabilities,
   autonomy, and status.
3. Create `page.tsx` and `client.tsx`.
4. Use an existing document schema where possible: Pattern, SynthScene,
   MidiClip, or audio-stream patch.
5. Route audio through shared audio helpers where possible.
6. Use `SamplePicker`, `ToolExportPanel`, `AudioOutputRecorder`, FX slots, and
   global music context when relevant.
7. Add colocated tests.
8. Run platform audits, unit tests, typecheck, lint, and any audio tests.

### Generate A New L1 Instrument With An L2 Builder

Use this when the instrument should be created by the AI builder workflow.

1. Open `/dashboard`.
2. Choose `build L1 tool` or a specialized builder.
3. Write a brief that describes the instrument, not only the UI.
4. Prefer concrete musical contracts: document type, sample roles, scale
   behavior, voices, MIDI export, FX slots, recording, and expected controls.
5. Let the builder read references, instantiate a skeleton, edit generated
   files, and run gates.
6. If verification fails, treat the failure as design feedback and rebuild or
   edit until gates pass.
7. Confirm the generated tool appears under generated L1 tools and can be
   rebuilt through `/build?edit=<slug>`.

### Add A New L2 Builder Domain

Use this when a new family of generated instruments needs its own constraints.

1. Add a domain to `BuilderProfileDomainSchema`.
2. Add a profile blueprint in `lib/agents/builder-profiles.ts`.
3. Choose target instrument type, document type, workflow, reference agent,
   template kit, sandbox root, capabilities, music context, steps, gates, and
   constraints.
4. Add or reuse a template in `lib/agents/templates/tool-skeleton/`.
5. Add route wiring under `/build/<domain>`.
6. Update platform-hardening expected targets if needed.
7. Add tests for profile creation, manifest registration, and audit behavior.

### Add A New Musical Document Primitive

Use this only when Pattern, SynthScene, MidiClip, and audio-stream patch
documents cannot represent the instrument honestly.

1. Define a Zod schema and type for the document.
2. Add a manifest document enum value in `InstrumentDocumentSchema`.
3. Add output mapping in generated and platform audits.
4. Add playback or processing engine support.
5. Add export declaration and adapters.
6. Add builder template support if L2 should generate tools of that type.
7. Add tests for schema validation, playback/export, audits, and generated
   registration.

### Add A New Export Type

1. Extend `ExportStrategySchema` and the relevant declaration schema.
2. Add artifact creation helpers.
3. Add adapters for the document types that support it.
4. Update `ToolExportPanel` only if the UI needs a new action.
5. Update manifest export hardening.
6. Add tests for generated and installed tools that declare the export.

### Add New Samples

1. Add committed files under `public/samples/**`.
2. Add library entries in `lib/samples/library.ts` or regenerate the curated
   suite.
3. Run `pnpm curate:samples:check`.
4. Rebuild analysis cache with `pnpm analyze:library` when the sample should
   have baked analysis.
5. Run `pnpm analyze:library:check`.

## Design Principles

The framework favors:

- Manifest-first identity.
- Serializable musical documents.
- Prompt-first creative control.
- Explicit Web Audio boundaries.
- Shared global BPM/key/scale context.
- Shared sample, FX, export, and recording surfaces.
- Generated source that can be inspected and rebuilt.
- Sandbox writes for L2 tools.
- Verification before registration.
- Local deterministic fallback when AI services fail.
- Honest document types: sample tools output Pattern, synth tools output
  SynthScene, MIDI tools output MidiClip, effects output audio-stream patches.

The framework avoids:

- Hiding all musical output inside transient audio nodes.
- Letting generated tools bypass registry metadata.
- Claiming MIDI export for continuous gestures that do not have a stable note
  timeline.
- Letting effects masquerade as Pattern or SynthScene generators.
- Unbounded generated DSP parameters.
- Source generation outside the generated-tool sandbox.
- Treating a model response as successful before tests and audio gates pass.

## Glossary

| Term | Meaning |
| --- | --- |
| L1 | A playable instrument, generator, effect, analyzer, or MIDI tool. |
| L2 | A builder that creates or rebuilds L1 tools. |
| Agent manifest | The typed identity and capability contract for a tool. |
| Pattern | Serializable sample sequencing document. |
| SynthScene | Serializable multi-voice synth document. |
| MidiClip | Serializable discrete MIDI document. |
| Audio stream | Serializable or bounded audio processing/analysis patch family. |
| Generated registry | `.audit/generated-tools.json`, the accepted generated tool registry. |
| Snapshot | `.audit/snapshots/<slug>/`, accepted generated source at registration time. |
| Prompt-first | UI ordering where source/context selectors come first, then prompt, then playback/export/manual editing. |
| Audio gate | Browser OfflineAudioContext verification that rendered output is audible, finite, unclipped, and the expected duration. |
| Platform hardening | Repo-level audit that checks L1/L2 manifests against workstation rules. |
| Builder profile | A specialized L2 domain contract that constrains what kind of L1 tool can be generated. |
