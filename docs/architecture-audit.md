# Architecture Audit

Date: 2026-05-15

Repo: toolpa JavaScript implementation local checkout

## Executive Summary

The current architecture has the right core shape for an AI-native browser instrument framework: typed tool manifests, serializable musical documents, a central dashboard, shared Web Audio engines, generated-tool registration gates, and a growing set of L1 instruments. The strongest parts of the system are the manifest contract, the Pattern/SynthScene/MidiClip document model, the generated-tool sandbox, and the browser-audio verification strategy.

The initial architectural risk was not the audio engine. It was the gap between the intended product model and the actual builder/registry behavior:

1. A generated tool can appear in the runtime dashboard while missing from `.audit/generated-tools.json`, so the generated audit can report ready while the real in-tree generated set is not fully registered.
2. `/api/build` currently uses the deterministic skeleton path (`runBuilderAgent`) rather than the existing LLM `ToolLoopAgent` creation path, so the general L2 builder is mostly a skeleton factory unless explicitly wired differently.
3. The manifest contract supports `midi` / `midi-clip`, but the L2 builder schema initially accepted MIDI requests even though the skeleton pipeline rejected them later.

Those were product-architecture issues, not cosmetic bugs. The remediation pass after this audit addressed two of the three P1 items and added an extra generated-source syntax guard:

- Generated audit now reconciles `.audit/generated-tools.json` with in-tree generated manifests.
- `harmonic-distrotion-effect` is now registered in `.audit/generated-tools.json`.
- Build request contracts now reject unsupported `midi` / `midi-clip` L2 targets until a MIDI builder profile exists.
- Generated TS/TSX edits are syntax-checked before `editToolFile` overwrites an existing generated file.

The remaining P1 architectural decision is the general create path: `/api/build` still defaults to deterministic skeleton generation, with the LLM tool-loop builder available only when `TOOLPA_JS_BUILDER_MODE=tool-loop` is set.

## Audit Method

This audit inspected:

- App routes under `app/`, including dashboard, build, API, and tool routes.
- Tool manifests under `app/tools/*/manifest.ts`.
- Agent registry, generated registry, generated audit, platform hardening, sandbox, and builder verification code under `lib/agents/`.
- Audio, sample, MIDI, music-context, and AI gateway layers under `lib/audio/`, `lib/samples/`, `lib/midi/`, `lib/music/`, and `lib/ai/`.
- Shared UI components under `components/`.
- Test/build config in `vitest.config.ts`, `eslint.config.mjs`, `tsconfig.json`, and `package.json`.

Commands used during the audit included:

- `git status --short`
- `node -r tsx/cjs` manifest inventory scripts
- `node -r tsx/cjs` platform/generated audit scripts
- `rg` scans for high-risk patterns
- `pnpm test:unit`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

The worktree was already dirty before this audit. This document intentionally avoids interpreting unrelated dirty files as audit changes.

## Current Architecture Map

### Product Surface

The product is a Next.js App Router app centered around `/dashboard`.

Primary surfaces:

- `/dashboard`: catalog, global music context controls, installed/generated/builder filters, generated-tool audit summary, platform-hardening summary.
- `/tools/<slug>`: L1 playable instruments/effects/analyzers.
- `/build`: general L2 builder.
- `/build/sample`, `/build/synth`, `/build/effect`, `/build/hybrid`, `/build/microtonal`: specialized L2 builder profiles.
- `/api/generate`: Pattern generation stream for sample-pattern tools.
- `/api/synth`: SynthScene generation/evolution with local fallback.
- `/api/build` and `/api/build/edit`: generated-tool create/edit streams.
- `/api/analyze-upload`: node-side WAV analysis endpoint.
- `/api/sample-analysis`: LLM descriptors and sample-use ideas.
- `/api/suggestions`: prompt suggestion endpoint.

### Manifest Model

`AgentManifestSchema` is the source of truth for tool identity and capabilities.

Current manifest dimensions:

- `level`: `1` for playable tools, `2` for builders.
- `origin`: `installed` or `generated`.
- `instrument.type`: `sample`, `synth`, `hybrid`, `effect`, `midi`, or `builder`.
- `instrument.document`: `pattern`, `synth-scene`, `midi-clip`, `audio-stream`, or `files`.
- `outputs`: `pattern`, `synthScene`, `midi`, `audio`, `recording`, `files`, `manifest`.
- `musicContext`: global BPM/key/scale participation flags.

Current runtime inventory from the registry:

| Count | Value |
| --- | --- |
| Total manifests | 17 |
| L1 tools | 11 |
| L2 builders | 6 |
| Installed manifests | 15 |
| Generated manifests visible at runtime | 2 |
| Instrument types | builder 6, sample 5, synth 3, effect 1, midi 1, hybrid 1 |
| Document types | files 6, pattern 4, synth-scene 3, audio-stream 3, midi-clip 1 |

The runtime currently resolves these notable L1s:

- `intelligence-sampler`: sample Pattern tool.
- `splice-lab`: multi-source sample Pattern tool.
- `grid-sampler`: sample-grid Pattern tool.
- `drum-machine`: one-shot Pattern tool.
- `evolving-fm-synth`: SynthScene tool with MIDI export.
- `camera-theremin`: continuous SynthScene/live synth tool without MIDI export.
- `sample-analysis`: sample analyzer over `audio-stream`.
- `midi-generator`: dedicated `midi-clip` instrument with sine preview.
- `time-stretch`: hybrid audio-stream stretch/freeze tool.
- `sine-wave-synth`: generated SynthScene tool.
- `harmonic-distrotion-effect`: generated audio-stream effect tool.

### Registry And Audit Layer

`getAgentManifests()` merges:

1. `.audit/generated-tools.json` via `readGeneratedAgentManifests()`.
2. in-tree `app/tools/*/manifest.ts` via `readInTreeAgentManifests()`.

It stores by slug, and later entries overwrite earlier entries. Since in-tree manifests are read after generated registry manifests, the actual runtime view is dominated by in-tree manifests when slugs collide.

`createPlatformHardeningAudit()` checks all runtime manifests for route, document output, audio output, recording, MIDI export where relevant, music context, and L2 builder conventions.

`createGeneratedToolAudit()` now checks the generated registry projection against in-tree generated manifests when given both sources. The dashboard and build pages pass `readGeneratedAgentManifests()` plus `readInTreeAgentManifests()` with `checkFiles: true`, so a generated tool visible in `app/tools` but missing from `.audit/generated-tools.json` is reported as unhealthy.

### L2 Builder Pipeline

The builder system has two distinct code paths:

- `runBuilderAgent()`: deterministic path. Resolves name/slug/type, reads schemas/reference tool, instantiates the canonical skeleton, validates, and optionally registers.
- `runBuilderToolLoopAgent()`: LLM tool-loop path. Uses `ToolLoopAgent`, can read files, edit generated files, rerun gates, and register.

`/api/build` currently defaults to `runBuilderAgent()` unless `TOOLPA_JS_BUILDER_MODE=tool-loop` is set. `/api/build/edit` calls `runBuilderEditAgent()`, which uses `ToolLoopAgent`. That means create mode is scaffold-first by default, while rebuild mode is agent-edit-first.

Registration gates in `registerTool()`:

1. Validate manifest.
2. Run static audit.
3. Run scoped typecheck.
4. Run scoped unit tests.
5. Run browser audio gate.
6. Snapshot generated files.
7. Rewrite `.audit/generated-tools.json`.

The generated-tool sandbox restricts writes to `app/tools/<slug>/` and has reserved slug/path traversal checks.

### Audio Architecture

The main sample-pattern playback layer is `PatternEngine`:

- Uses Tone.js and a shared Tone transport.
- Resolves sample IDs through the sample resolver.
- Builds Tone parts from serialized Pattern events.
- Supports live pattern update by replacing Tone parts while keeping output graph when compatible.
- Owns output through `createToneFxGraph()`.
- Publishes playback trace events.
- Uses `transport-owner` to prevent one engine from stopping Tone transport while another engine is active.

Synthesis paths:

- `evolving-fm-synth` uses SynthScene data, local deterministic generation, gateway enhancement, playback, WAV render, MIDI export, and FX slots.
- `camera-theremin` is a continuous live synth and correctly avoids claiming stable MIDI export.
- `midi-generator` uses a dedicated MidiClip schema, Standard MIDI export, MIDI visualization, and a simple sine preview synth.

Recording:

- `AudioOutputRecorder` records the global Tone destination through `Tone.Recorder`.
- Recorded output is normalized to WAV and analyzed for scale evidence.

### Sample And Analysis Architecture

Samples come from:

- Static public library samples under `public/samples/`.
- Browser-local uploads stored in IndexedDB.

Resolution:

- `resolveSample()` caches decoded `AudioBuffer` promises.
- Library samples are fetched by `href`.
- Uploaded samples are loaded from IndexedDB.

Analysis:

- `getSampleSchema()` uses baked library analysis when available.
- Upload analysis tries `/api/analyze-upload` first, then falls back to browser DSP.
- LLM descriptor enrichment goes through `/api/sample-analysis`.

### MIDI Architecture

There are two MIDI paths:

- `lib/midi/export.ts`: low-level deterministic Standard MIDI encoder.
- `lib/midi/synth-scene.ts`: SynthScene-to-MIDI conversion.
- `app/tools/midi-generator/lib/export.ts`: MidiClip-to-MIDI conversion.

The MIDI model is currently discrete-note oriented. Continuous live gestures such as camera theremin are intentionally not exported as a fake timeline.

### Testing Architecture

Vitest has two projects:

- `unit`: happy-dom, all normal `*.test.ts(x)`.
- `audio`: browser/Playwright Chromium, `*.audio.test.ts` and `*.browser.test.ts`.

Current test surface is broad:

- Manifest tests.
- Registry/contract/platform/generated-audit tests.
- Tool client tests.
- Audio engine tests.
- Browser audio-gate tests for generated tools.
- API handler tests.
- Sample analysis and DSP tests.

## Strengths

### 1. Strong Serializable Document Boundary

Pattern, SynthScene, MidiClip, and audio-stream patch contracts keep tool output inspectable. This is the right foundation for an AI-native browser music framework because generated output is not trapped inside transient Web Audio nodes.

### 2. Manifest-First Tool Identity

The manifest contract gives every tool a declared level, type, document, route, outputs, inputs, and capabilities. This makes dashboard filtering, platform hardening, and generated-tool registration possible.

### 3. Good Generated-Tool Gate Design

The register path validates manifests, static safety, typecheck, unit tests, browser audio output, snapshots, and registry metadata. That is much stronger than letting the model write code and immediately exposing it.

### 4. Browser Audio Lessons Are Encoded In Tests

There is a separate browser-audio Vitest project, offline audio analysis, RMS/peak checks, and render-gate requirements for generated tools. This is exactly the right class of verification for this product.

### 5. Global Music Context Is Now A Real Cross-Tool Primitive

Global BPM/key/scale lives in a typed store and appears in dashboard controls, tool prompts, sample generation, synth generation, and the MIDI generator. This is a good product-level abstraction.

### 6. MIDI Has A Real Artifact Path

The MIDI path produces Standard MIDI files, not just UI labels. SynthScene export and MidiClip export both route through shared MIDI primitives.

## Findings

### P1: Generated Registry Audit Has A Runtime Blind Spot

Status: fixed in the remediation pass.

Historical evidence:

- Runtime registry sees generated in-tree tools: `harmonic-distrotion-effect` and `sine-wave-synth`.
- `.audit/generated-tools.json` only contains `sine-wave-synth`.
- `createGeneratedToolAudit(readGeneratedAgentManifests(), { checkFiles: true })` reports `1/1 generated tools ready`.
- The dashboard runtime still shows `harmonic-distrotion-effect` because `getAgentManifests()` also reads in-tree manifests.

Current evidence:

- `.audit/generated-tools.json` contains both `harmonic-distrotion-effect` and `sine-wave-synth`.
- `createGeneratedToolAudit(readGeneratedAgentManifests(), { checkFiles: true, inTreeManifests: readInTreeAgentManifests() })` reports `ready`, `2/2 generated tools ready for dashboard use.`
- Dashboard and build pages pass both generated registry manifests and in-tree manifests into the generated audit.

Impact:

Before the fix, the dashboard could expose an unregistered generated tool while the generated audit reported clean. That bypassed the intended registry/snapshot source of truth and weakened the audit as a safety gate.

Recommendation:

- Make generated audit compare both sources:
  - generated registry entries
  - in-tree manifests where `origin === "generated"`
- Emit an error for every in-tree generated manifest missing from `.audit/generated-tools.json`.
- Emit an error for every registry entry missing an in-tree manifest.
- Consider changing `getAgentManifests()` so in-tree `origin: "generated"` manifests are ignored unless present in the generated registry, or at least shown as `unregistered`.

Suggested test:

- Add a generated-audit test where an in-tree generated manifest exists but is absent from `.audit/generated-tools.json`; expected status should be `attention`.

Fix applied:

- `GeneratedToolAuditEntry` now records `registered` and `hasInTreeManifest`.
- `createGeneratedToolAudit()` reconciles registry and in-tree generated manifests when `inTreeManifests` is provided.
- Dashboard and build pages pass both sources.
- `harmonic-distrotion-effect` is now present in `.audit/generated-tools.json`.
- Regression tests cover missing registry entries and missing in-tree manifests.

### P1: General L2 Create Path Is Deterministic Skeleton Generation, Not The Tool-Loop Builder

Status: still open as a product-architecture decision.

Evidence:

- `/api/build` calls `handleBuildRequest()`.
- `handleBuildRequest()` defaults to `getDefaultBuildRunner()`.
- `getDefaultBuildRunner()` calls `runBuilderToolLoopAgent()` only when `process.env.TOOLPA_JS_BUILDER_MODE === "tool-loop"`.
- Without that env flag, `getDefaultBuildRunner()` calls `runBuilderAgent()`.
- `runBuilderAgent()` reads schema/reference files, instantiates the canonical skeleton, validates, and registers.
- The LLM-backed `runBuilderToolLoopAgent()` exists but is not the default create path in a normal environment.
- `/api/build/edit` does use `runBuilderEditAgent()` with `ToolLoopAgent`.

Impact:

The user-facing L2 "builder" can look like an AI builder while the create path mostly emits template tools. The prompt can influence name, slug, type, and description, but it does not deeply implement bespoke behavior unless the deterministic skeleton already covers it.

Recommendation:

- Decide explicitly between two product modes:
  - `skeleton mode`: fast deterministic scaffold, named honestly in UI.
  - `agent mode`: `ToolLoopAgent` creation path with bounded steps and verification.
- If the product promise is AI-generated tools, wire `/api/build` to `runBuilderToolLoopAgent()` or add an explicit mode switch.
- Keep deterministic skeleton generation as a fallback or "scaffold only" path.

Suggested test:

- API build test asserting which runner `/api/build` uses by default with and without `TOOLPA_JS_BUILDER_MODE=tool-loop`.
- UI copy test so the visible builder text matches the real behavior.

### P1: MIDI Is A First-Class L1 Type But Not A Supported L2 Builder Target

Status: fixed by rejecting unsupported L2 targets early. A MIDI L2 builder is still future work.

Evidence:

- `AgentManifestSchema` accepts `instrument.type = "midi"` and `instrument.document = "midi-clip"`.
- `midi-generator` is registered as an installed L1 MIDI instrument.
- `BuildToolRequestSchema.instrumentType` now accepts only `sample`, `synth`, `effect`, and `hybrid`.
- `BuildToolSpecializationSchema.targetDocument` now accepts only `pattern`, `synth-scene`, and `audio-stream`.
- There is no MIDI builder profile or MIDI skeleton.

Impact:

The API contract no longer accepts MIDI builder requests that the builder cannot fulfill. A MIDI L2 builder is still missing, so MIDI is first-class as an L1 document/tool but not yet a generated-tool domain.

Recommendation:

- Either add a MIDI L2 builder profile and `midi-clip` skeleton, or narrow `BuildToolRequestSchema.instrumentType` to the currently supported skeleton types.
- Add dashboard/build UI affordances that make MIDI generation available as an L1 tool now and as an L2 builder only when a MIDI skeleton exists.

Suggested test:

- Contract test that `instrumentType: "midi"` is either rejected at request parse time or successfully routes to a MIDI skeleton.

Fix applied:

- `BuildToolRequestSchema.instrumentType` is now limited to `sample`, `synth`, `effect`, and `hybrid`.
- `BuildToolSpecializationSchema.targetInstrumentType` is now limited to the same supported builder targets.
- `BuildToolSpecializationSchema.targetDocument` is now limited to `pattern`, `synth-scene`, and `audio-stream`.
- Regression tests reject `midi` / `midi-clip` builder requests until a MIDI skeleton/profile exists.

### P2: Documentation Drift Is A Continuing Framework Risk

Status: current README inventory is aligned with the manifest inventory, but the repo still has no automated doc inventory check.

Evidence:

- README now lists `sample-analysis`, `midi-generator`, `time-stretch`, `sine-wave-synth`, and `harmonic-distrotion-effect`.
- Runtime inventory is currently verified from `getAgentManifests()` as 17 manifests: 11 L1 tools, 6 L2 builders, 15 installed manifests, and 2 generated manifests.
- This inventory is still hand-maintained in README rather than generated from manifests.

Impact:

Hand-maintained framework docs can drift away from the dashboard and registry as new tools are generated or committed. That makes onboarding and future L2 builder work more error-prone.

Recommendation:

- Add an automated doc inventory check or generate the tool inventory section from manifests.

### P2: Open Source Framework Packaging Is Not Ready Yet

Evidence:

- `package.json` still has `"private": true` and package name `toolpa-js`, while the product-facing README and UI use the framework name `toolpa`.
- Package names, deployment names, and env prefixes use JavaScript-implementation identifiers such as `toolpa-js` and `TOOLPA_JS_*`; public repo naming still needs one explicit decision before launch.
- There is no `LICENSE`, `CONTRIBUTING`, `SECURITY`, or `CODE_OF_CONDUCT` file in the repo.
- The framework is currently documented as an app/workstation, not as a consumable package with public extension APIs, versioned templates, or contributor contracts.

Impact:

The technical architecture can become a framework, but the project is not yet packaged or governed like one. External contributors would not know the license, contribution path, public API stability expectations, or whether generated-tool templates are supported extension points.

Recommendation:

- Keep `toolpa` as the framework identity and `toolpa-js` as the JavaScript implementation identity.
- Add license, contribution, security, and code-of-conduct files before promoting it as open source.
- Keep `private: true` if this is only an OSS app repo; remove it and define package exports only if this should be published as an npm framework.
- Document supported extension points: manifest schema, document schemas, builder templates, generated-tool gates, and sample/audio export adapters.

### P2: Global Tone Transport Ownership Prevents Stop Conflicts But Not Tempo Conflicts

Evidence:

- `PatternEngine.play()` sets `Tone.getTransport().bpm.value = pattern.bpm` for every engine.
- `transport-owner` tracks active engine IDs so the last engine controls stop/cancel.
- There is no policy preventing a second active engine from changing BPM while the first engine is still active.

Impact:

This is acceptable if only one tool page plays at a time. It becomes risky if multiple tools are embedded, previewed, or recorded together, because the newest engine can retime the shared transport.

Recommendation:

- Add an explicit transport policy:
  - one active musical transport at a time, or
  - shared global BPM only, or
  - per-tool Tone contexts/transports for independent playback.
- Surface that policy in code and tests.

### P2: Pattern Gateway Path Lacks The Timeout/Fallback Hardening Present In Synth Generation

Evidence:

- `generateSynthSceneWithGateway()` supports `SYNTH_GATEWAY_TIMEOUT_MS` and local fallback in the API handler.
- `streamPattern()` calls `streamText()` without a total timeout or local fallback.
- `handleGenerateRequest()` obtains `result = await deps.streamPattern(...)` before constructing the response stream.

Impact:

Gateway hangs or early failures in Pattern generation can leave a worse user experience than SynthScene generation. This repeats a class of issue already fixed elsewhere in the repo.

Recommendation:

- Add a pattern generation timeout.
- Add a local fallback Pattern mutation path per tool, or at least a bounded error response before stream setup.
- Keep stale-request guards in clients so old streams cannot overwrite newer patterns.

### P2: Generated-Tool Static Audit Is Strong But Not Comprehensive Enough As The Only Safety Boundary

Evidence:

The static audit checks required files, TypeScript syntax diagnostics, client boundary, placeholder text, disallowed imports, browser storage globals, exfiltration globals, dynamic import shape, dynamic code, and module-level audio construction.

Gaps:

- It only applies to generated tools during registration.
- By itself, it does not hide or quarantine generated tools that enter the runtime outside `.audit/generated-tools.json`; the generated audit reconciliation has to stay wired into dashboard/build surfaces.
- It does not enforce UI quality, accessibility, route smoke, or dashboard visibility.
- It does not require MIDI export tests for generated SynthScene tools beyond manifest/platform checks.

Recommendation:

- Keep generated audit registry-vs-in-tree reconciliation wired into every generated-tool dashboard/build surface.
- Add a small route smoke or static render check after registration.
- Require MIDI export unit coverage for generated SynthScene tools that declare `outputs.midi`.

### P2: Live Recording Captures The Global Destination, Not A Tool-Scoped Bus

Evidence:

- `startLiveOutputRecording()` connects `Tone.getDestination()` to one `Tone.Recorder`.
- The recorder is global singleton state.

Impact:

This is simple and useful, but it records anything routed to the global destination. If multiple tools/previews are active, output is not scoped to the current tool.

Recommendation:

- Keep global recording as a simple mode, but add tool-scoped recording buses for instruments that need precise exports.
- Encode recording source identity in the recording layer, not only in the UI component.

### P2: Tool Implementations Are Converging But Still Duplicate Control Logic

Evidence:

Multiple tools implement local copies of:

- prompt state
- generate/edit state
- play/stop state
- recording controls
- global context syncing
- MIDI/export/JSON copy actions
- status/error state

Impact:

The system is still young enough that duplication is acceptable, but repeated playback and generation bugs are likely as more L1s are added.

Recommendation:

- Extract a small `ToolRuntimePanel` or tool controller hook only after one more round of feature work clarifies the stable shape.
- Do not over-abstract audio graph internals yet; start with prompt/generate/play/record state and status handling.

### P3: Sample Uploads Are Browser-Local Only

Evidence:

- Uploaded samples are persisted in IndexedDB via `lib/samples/storage.ts`.
- `resolveSample()` loads uploads from browser storage.

Impact:

This is fine for a local creative tool. It is not enough for cross-device sessions, sharing, collaboration, or server-generated rebuilds that need uploaded sample bytes.

Recommendation:

- Document this as a deliberate local-first storage model.
- If sharing becomes a product goal, add object storage and stable upload manifests.

### P3: README And Architecture Rules Should Define Document Length Semantics

Evidence:

- Pattern bars are bounded to 1-16.
- SynthScene has its own bar-cycle model.
- MidiClip supports 2-1024 bars.

Impact:

Different document types correctly have different time horizons, but this is not clearly stated as product architecture.

Recommendation:

- Document that Pattern is a compact sample-pattern document, SynthScene is a discrete synth scene/modulation document, and MidiClip is the long-form MIDI artifact document.

## Recommended Remediation Plan

### Phase 1: Fix Source-Of-Truth Gaps

1. Keep generated registry and in-tree generated manifest reconciliation in dashboard/build surfaces.
2. Decide whether unregistered generated tools are hidden, marked unhealthy, or auto-registered only after gates.
3. Keep generated audit tests covering missing registry entries and missing in-tree manifests.
4. Add automated README/tool-inventory drift detection.

### Phase 2: Make Builder Semantics Honest

1. Decide whether `/api/build` should be skeleton mode or agent mode.
2. If agent mode, wire `runBuilderToolLoopAgent()` behind `/api/build` with bounded step/token/time controls.
3. If skeleton mode, rename/copy the UI to make that clear.
4. Add default-runner tests for both normal skeleton mode and `TOOLPA_JS_BUILDER_MODE=tool-loop`.

### Phase 3: Extend MIDI Platform Support

1. Add a MIDI builder profile if generated MIDI tools are part of the roadmap; current MIDI builder requests are rejected early.
2. Add a MIDI skeleton if generated MIDI tools are part of the roadmap.
3. Add platform-hardening checks for `midi-clip` L1s, including MIDI export tests and visual playback requirements.

### Phase 4: Harden Runtime Audio And AI Paths

1. Add Pattern generation timeout/fallback parity with SynthScene generation.
2. Define the global Tone transport policy.
3. Decide whether recording stays global or grows tool-scoped buses.
4. Add smoke coverage for dashboard route visibility after generated registration.

### Phase 5: Prepare For Open Source

1. Keep the public framework identity as `toolpa` and document this package as the JavaScript implementation.
2. Add `LICENSE`, `CONTRIBUTING`, `SECURITY`, and contributor setup expectations.
3. Mark which modules are public extension APIs and which are internal app code.
4. Add a docs/check script that verifies README inventory, env variable names, and generated-tool registry examples against code.

## Verification Snapshot

Current automated status from this audit pass:

- Focused builder/audit tests: `pnpm exec vitest run --project unit lib/agents/builder-tools.test.ts lib/agents/builder-verification.test.ts lib/agents/generated-audit.test.ts lib/agents/builder-contracts.test.ts app/api/build/handler.test.ts` passed 5 files / 22 tests.
- `pnpm test:unit`: passed 134 files / 492 tests.
- `pnpm test:audio`: passed 6 files / 7 tests.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with two existing unused-`vi` warnings in generated audio tests.
- `pnpm build`: passed and included `/tools/midi-generator`, `/tools/sample-analysis`, `/tools/sine-wave-synth`, and `/tools/harmonic-distrotion-effect`.

Registry/audit status observed:

- Platform hardening: `ready`, `11 L1 tools and 6 L2 builders pass platform hardening gates.`
- Generated audit after remediation: `ready`, `2/2 generated tools ready for dashboard use.`
- Generated source reconciliation after remediation: in-tree generated tools and generated registry both contain `harmonic-distrotion-effect` and `sine-wave-synth`.

## Bottom Line

The app architecture is promising and already has unusually good contract and audio verification infrastructure. The source-of-truth gap between runtime manifests and generated registry metadata is now covered by generated-audit reconciliation, but the runtime still needs a policy for whether unregistered generated tools are hidden or merely marked unhealthy. The highest-leverage next move is making the L2 builder behavior match the product promise. After that, MIDI builder support and AI timeout/fallback parity are the next framework-level improvements.
