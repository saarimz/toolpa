# ai-daw-tools

> An open, transparent, agent-addressable workshop for making music with LLMs.
> Where commercial AI music products generate finished tracks behind a black-box "go" button,
> this is the inverse — a system of small composable instruments where every decision is visible,
> every primitive is editable, and the act of building the tool is itself a musical act.

---

## What this is

**ai-daw-tools** is a browser-native music environment built around three ideas:

1. **A universal music document.** Every instrument in the system reads and writes
   typed JSON. A drum pattern, a synth scene, a slice grid, a stutter loop — they are
   all just documents conforming to a published schema. You can serialize them into URLs,
   commit them to git, edit them by hand, mutate them with an LLM, or pipe them between
   tools.

2. **Levels of agency, not levels of automation.**
   - **L1** is a tool that makes music — a sampler, a synth, a drum machine.
   - **L2** is an agent that builds new L1 tools from a natural-language description.
   - **L3** (in progress) is an agent that builds new L2 builders — a synth-builder,
     an effect-builder, a microtonal-builder — each templating tools for a different domain.

   The whole stack is observable: every AI call streams its prompt, reasoning,
   and structured decisions. Nothing happens behind a curtain.

3. **A music-theory-aware shared context.** A `GlobalMusicContext` carries the current
   BPM, swing, key, and scale across every tool in a session. Scales are first-class
   objects supporting four tuning systems (`12tet`, `EDO`, `cents`, `ratios`), so the
   system handles everything from standard 12-tone music to Bohlen-Pierce, just intonation,
   and Scala-compatible imports.

The whole thing is open source, Vercel-deployable, and bring-your-own-model. The Vercel
AI Gateway abstraction means you can swap Anthropic Claude for OpenAI, Gemini, or any
other provider with one config change.

---

## Why this exists (anti-Suno, in earnest)

Suno-style "prompt → complete song" generators are fast food for music.
They produce listenable artifacts efficiently and they skip every step where craft
used to live. You have no idea why the result sounds the way it does, who decided
what, what alternatives were suppressed, or how to push further.

This project takes the opposite stance:

| What Suno hides | What ai-daw-tools surfaces |
|---|---|
| The decision to pick a key, a tempo, a groove | A `GlobalMusicContext` you read and write |
| The model's reasoning | A streaming reasoning panel beside every generation |
| Which patterns were considered but rejected | A first-class `alternative` chunk type in the stream |
| What the tool can and can't do | An `AgentManifest` declaring inputs, outputs, capabilities, autonomy |
| When the model can't do something cleanly | An explicit `breach` chunk you can see and act on |
| The boundary between user intent and model output | Steps carry `metadata.createdBy: 'manual' \| 'ai' \| 'import'` |
| What "interesting music" even means | You decide. The tools are primitives. |

The goal isn't to *replace* generative AI; it's to **expose** it.
A pattern with `probability: 0.7` and `microShift: -0.04` isn't a black box —
it's a document you can read, share, mutate, and reason about.
An LLM emitting one is doing something you can supervise.

This is also a practical bet: a system this *primitive-rich* would be intractable
to hand-code traditionally, but with LLMs as a primary collaborator, the cost of
adding a new instrument or a new scale family or a new step parameter drops to
"describe it and watch it appear." That's the L2 builder's whole job.

---

## The system, at a glance

```
                  ┌────────────────────────────────────┐
                  │   GlobalMusicContext               │
                  │   { bpm, swing, key: { tonic,      │
                  │     scaleId, referenceFrequency }} │
                  └────────────────┬───────────────────┘
                                   │ consumed by every tool that opts in
                                   ▼
   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐
   │  L1 tool  │   │  L1 tool  │   │  L1 tool  │   │  L1 tool  │
   │ sample-   │   │  synth    │   │ drum-     │   │  effect   │
   │  based    │   │           │   │ machine   │   │           │
   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
         │ emits         │ emits         │ emits         │ emits
         ▼               ▼               ▼               ▼
      Pattern        SynthScene        Pattern       audio-stream
          \              \                /                /
           \              \              /                /
            ───────────► Tone.js audio engine ◄──────────
                                   │
                                   ▼
                                  WAV / browser playback
                                   ▲
                                   │ scheduled by
                  ┌────────────────┴───────────────────┐
                  │   Tone.getTransport()              │
                  │   (singleton clock, BPM/swing)     │
                  └────────────────────────────────────┘

                  ┌────────────────────────────────────┐
                  │   L2 _builder agent                │
                  │   description → tool files →       │
                  │   typecheck → tests → registered   │
                  └────────────────────────────────────┘
                                   │
                                   ▼
                    new L1 tool appears at /dashboard

                  ┌────────────────────────────────────┐
                  │   L3 _l3-builder (planned)         │
                  │   description + targetType →       │
                  │   new specialized L2 builder       │
                  └────────────────────────────────────┘
```

Everything is typed end-to-end with Zod. Every primitive is auditable.
Every AI call goes through Vercel AI Gateway, so model choice is configuration.

---

## Core concepts

### The universal music document

There isn't *one* universal document type — there are **two cooperating ones** that
share a tonal/transport context:

#### `Pattern` (lib/pattern/schema.ts)

The richer-than-MIDI step-sequencer document. Every track is an array of steps,
and every step carries:

| Field | Meaning |
|---|---|
| `active` | Will this step fire? |
| `velocity` | 0..1 loudness |
| `microShift` | -0.5..0.5 fraction of a step — humanization beyond global swing |
| `probability` | 0..1 chance the step actually fires this cycle |
| `conditions` | `everyN`, `firstOfN`, `notFirstOfN` — gates by bar index, for fills |
| `pitchSemitones` | Integer pitch shift (12TET) |
| `playbackRate` | Direct playback-rate override |
| `decay` | Gate-length multiplier |
| `reverse` | Play the sample backwards |
| `chokeGroup` | Mutual-exclusion key — when one step in the group fires, others mute |
| `repeats` | Sub-step repeats (rolls/flams) |
| `sampleId` / `slot` | Which sample this step plays |

A `Pattern` carries `bpm`, `swing`, `bars`, `stepsPerBar`, a list of `Track`s, and
a `metadata` object including `createdBy: 'manual' | 'ai' | 'import'`, a
free-form `rationale` string explaining the agency behind the pattern, and `tags`.

This document is what LLMs emit when they "generate a pattern." It's a JSON
object validated by a Zod schema — there's no opaque tensor, no diffusion model.

#### `SynthScene` (app/tools/evolving-fm-synth/lib/schema.ts)

The synth-shaped document, used by tools that synthesize sound rather than play
samples. Carries `voices` (each with `patch`, `steps`, `gain`, `pan`, `role`),
`effects` (filter / delay / reverb / chorus / drive), and `macros` (`evolution`,
`mutationDepth`, `brightness`, `dubSpace`, `density`, `analogDrift`).

Why a different schema? Synths have parameters samples don't (oscillator partials,
modulation indices, ADSR envelopes per voice). Forcing them into a step-grid
shape would lose meaning. They share `bpm`, `swing`, and `key` via the global
context (see below), so they still compose with sample tools — just via adapters
that translate document → document, not via a single bloated schema.

#### Why two schemas instead of one universal type

The earlier architectural plan considered unifying everything into one
`MusicalDocument` (union, base interface, or event log). The chosen design is
better: **keep the documents shape-specific, share the context.**
This is how DAWs and live performers actually think — shared BPM/key,
independent instruments. Cross-document composition uses small adapters
(`Pattern → SynthScene` extracts MIDI from active steps; `SynthScene → audio-stream`
records via `Tone.Recorder`).

### The Global Music Context

```ts
type GlobalMusicContext = {
  bpm: number;                 // 40-260
  swing: number;               // 0-0.5
  key: {
    tonic: 'C' | 'C#' | ... | 'B';
    scaleId: string;           // references a ScaleDefinition
    referenceFrequency: number; // 400-480 Hz, A4 anchor
  };
};
```

Tools opt into pieces of this context through their manifest:

```ts
instrument: {
  type: 'sample' | 'synth' | 'hybrid' | 'effect' | 'builder',
  document: 'pattern' | 'synth-scene' | 'audio-stream' | 'files',
  workflow: string,            // free-form workflow tag
  usesSamples: boolean,
  usesSynthesis: boolean,
}
musicContext: {
  globalBpm: boolean,          // follow the session's BPM?
  globalKey: boolean,          // follow the session's tonic + scale?
  scaleSearch: boolean,        // expose a "find scale" affordance?
}
```

When you wire two tools into a session, both see the same key, the same tempo,
and the same scale. Change the tonic from C to D and both retune simultaneously.

### Scales as first-class objects

The scale system supports **four tuning paradigms**, encoded as a discriminated
union (`lib/music/context.ts`):

| Kind | Use it for |
|---|---|
| `12tet` | Standard Western scales as intervals over twelve-tone equal temperament |
| `edo` | Equal divisions of the octave: 19-EDO, 22-EDO, 31-EDO, etc. Microtonal grids. |
| `cents` | Arbitrary cents values per scale step. Best for ethnomusicology imports. |
| `ratios` | Just intonation as fraction strings: `3/2`, `5/4`, `7/4`. Bohlen-Pierce too. |

Each `ScaleDefinition` carries `id`, `name`, `family`, `aliases`, `tags`,
`description`, `microtonal: boolean`, and a `source` field (`curated`,
`scala-compatible`, `tonal-compatible`) for interop with the
[Scala scale archive](https://www.huygens-fokker.org/scala/) and the
[`tonal`](https://github.com/tonaljs/tonal) library.

This means you can put any tool into Bohlen-Pierce or 31-EDO and the global
context will propagate the choice. (Sample-based tools currently snap to 12TET
even when the global scale is microtonal — see Track F on the roadmap;
the synth honors microtonal tunings natively.)

### Agents and the levels

| Level | Role | Current state |
|---|---|---|
| **L1** | A tool that makes music | 5 hand-built + 3 L2-generated, live |
| **L2** | An agent that builds new L1 tools from a description | Live, has generated 3 tools |
| **L3** | An agent that builds new L2 builders specialized per `instrument.type` | Planned (Track E) |

Every tool — at every level — is described by an `AgentManifest` (lib/agents/contract.ts).
The manifest is the contract: it declares the tool's level, its inputs and outputs,
its capabilities, its `autonomy` mode (`manual` / `assist` / `driven`), its
`status` (`enabled` / `disabled` / `coming-soon`), and its `origin`
(`installed` / `generated`).

The dashboard at `/dashboard` is just a sorted view of every manifest in the
registry. The registry is filesystem-discovered: drop a new `app/tools/<slug>/manifest.ts`
and the dashboard picks it up at build time. L2-generated tools live in
`.audit/generated-tools.json` and are merged in at runtime.

### Exposed agency, as data

Every generation streams typed chunks back to the UI (`lib/agents/builder-contracts.ts`):

```ts
type BuilderStreamChunk =
  | { type: 'decision'; message: string }
  | { type: 'alternative'; message: string }
  | { type: 'breach'; message: string }
  | { type: 'tool-call'; name: string; input: unknown; result: unknown }
  | { type: 'file'; path: string }
  | { type: 'manifest'; manifest: AgentManifest }
  | { type: 'verification'; name: 'manifest' | 'typecheck' | 'tests'; passed: boolean }
  | { type: 'complete'; manifest: AgentManifest; files: string[]; registered: boolean }
  | { type: 'error'; message: string };
```

The "alternatives the agent considered but rejected" and "boundary breaches"
are first-class types, not afterthoughts in a log. Reading the stream is reading
the agent's process.

The same approach extends to pattern generation: every `Pattern.metadata` carries
a `rationale` string that explains the decisions; AI-generated patterns mark
`createdBy: 'ai'`. The chain of custody for a sound is visible.

### The L2 builder, in detail

`/build` runs the level-2 agent that produces new L1 tools.

1. **You write a description** — "a tool that takes a vocal sample and stutters
   it like Burial."
2. **You optionally pick a reference agent** (defaults to `intelligence-sampler`,
   which is the canonical sample-based tool). Synth descriptions auto-route to
   `evolving-fm-synth`.
3. **The builder agent runs** — either `runBuilderAgent` (deterministic, scripted)
   or `runBuilderToolLoopAgent` (Claude-driven via `ToolLoopAgent`). The agent
   calls a fixed set of sandboxed tools:
   - `readSchema()` — read `lib/pattern/schema.ts`, `lib/agents/contract.ts`, `lib/samples/roles.ts`
   - `readToolFiles({ slug })` — read the reference tool's files
   - `instantiateSkeleton({ slug, name, description })` — render the template kit
   - `editToolFile({ slug, projectPath, content })` — write a file inside the sandbox
   - `runToolTypecheck({ slug })` — scoped `tsc --noEmit` against a per-tool tsconfig
   - `runToolTests({ slug })` — scoped `vitest run --project unit <slug>`
   - `validateManifest({ slug })` — re-evaluate the generated manifest, parse against schema
   - `registerTool({ slug })` — only succeeds if all three gates above pass
4. **Verification gates run on every registration attempt.** If typecheck fails,
   the agent gets diagnostics back as a tool result and can iterate. If sandbox
   boundaries are violated, a typed `SandboxBreach` is raised and the breach is
   surfaced in the UI rather than silently failing.
5. **The new tool appears on `/dashboard`** with `origin: generated`. You can
   play it, edit its pattern, share its URL, just like any hand-built tool.

The whole thing is sandboxed: the L2 agent cannot write outside
`app/tools/<slug>/`, cannot install packages, cannot modify shared code in
`lib/`. If it *wants* to, it surfaces a "feature request" breach — which is the
hand-off signal to a human or to a future L3 agent.

---

## Available tools (May 2026)

| Slug | Type | Origin | What it does |
|---|---|---|---|
| `intelligence-sampler` | sample | installed | Canonical break-sampler. Slice a break into 8 playable slots, sequence them. The reference tool the L2 builder reads. |
| `grid-sampler` | sample | installed | 2D grid of chops with directional traversals (`LR_serp`, `Spiral`, `Random`, etc.). Has its own tool-calling agent. |
| `drum-machine` | sample | installed | Multi-track sampler with polyrhythmic step counts per track (16 vs 13 vs 7) — patterns DAWs can't easily express. |
| `splice-lab` | sample | installed | A/B sample splice loop with `chokeGroup` mutual exclusion. The seed of multi-source composition. |
| `evolving-fm-synth` | synth | installed | Hybrid FM/wavetable synth with a deterministic local agent. Prompt → key/scale/BPM/macros/voices/effects/MIDI lanes. Microtonal-aware. |
| `vocal-stutter` | sample | generated | Stuttering vocal sampler with gated repeats. Built by L2 from a one-line description. |
| `l2-grid-sampler` | sample | generated | A second grid-sampler clone, generated by L2 — exists as a smoke-test for the L2 system. |
| `l2-drum-machine` | sample | generated | Polyrhythmic drum machine clone generated by L2. |
| `_builder` | builder | installed | The L2 agent itself. Routes to `/build`. |

---

## How to use this

### Run a tool

1. Visit `/dashboard`.
2. Click any tool.
3. Pick a sample (built-in library or upload your own).
4. Optionally type a vibe prompt and hit "Generate" — an LLM produces a typed
   Pattern (or SynthScene), the grid fills in live as the document streams.
5. Press play.
6. Click "Share" to copy a URL that round-trips the entire tool state.

### Have L2 build you a new tool

1. Visit `/build`.
2. Type a description: "*a tool that takes a percussion sample and arranges it
   on a triangle wave with conditional fills every 4 bars.*"
3. Pick a reference agent if you want (the builder will choose one if you don't).
4. Hit "Build."
5. Watch the stream: read schema → read reference → instantiate → typecheck → tests → register.
6. If the build passes, the tool now appears on `/dashboard` with `origin: generated`.
7. If the build hits a sandbox breach (e.g., "I'd need a granular-synthesis primitive
   that doesn't exist"), the breach is logged and you can either implement the
   primitive yourself or wait for the L3 builder to grow a new domain.

### Build a tool by hand

Every tool is a directory under `app/tools/<slug>/` with this shape:

```
app/tools/<slug>/
├── manifest.ts                # exports a const matching AgentManifestSchema
├── page.tsx                   # RSC route shell
├── client.tsx                 # 'use client' island
├── components/                # local components
├── lib/
│   ├── prompt.ts              # AI prompt builders (system + per-request)
│   └── play.ts (optional)     # Pattern → Tone.js scheduling
├── __tests__/                 # vitest tests (TDD-style)
└── store.ts (optional)        # Zustand slice
```

Drop a new folder, and the filesystem-driven registry picks it up at next build.
No edits to a global index, no manual dispatch wiring. Tools that don't have a
custom prompt builder fall back to `buildGenericToolPrompt` (lib/agents/dispatch.ts),
which uses the manifest's description as a system-prompt seed.

### Bring your own model

The whole AI integration goes through Vercel AI Gateway:

```ts
// lib/ai/gateway.ts
import { gateway } from '@ai-sdk/gateway';
gateway('anthropic/claude-sonnet-4.6')      // dot-format model identifier
```

To swap to another provider, change one env var (`AI_GATEWAY_MODEL`) or pass a
specific model into `getGatewayModel(modelId)`. The Gateway routes to OpenAI,
Anthropic, Google, Groq, and others. For deployed environments use OIDC tokens
via `vercel env pull`. For local development you can use `AI_GATEWAY_API_KEY`
in `.env.local`.

To add a model that the Gateway doesn't yet route, install the relevant
`@ai-sdk/<provider>` package and pass that provider's model directly into the
SDK's `streamText` / `Output.object` calls (see `lib/ai/pattern-generation.ts`).

### Compose tools (in progress)

A `/sessions/[id]` route is on the roadmap (Track C). The plumbing already
exists: `GlobalMusicContext`, the `useGlobalMusicContext()` and
`useGlobalContextSync()` hooks, and the `InstrumentMusicContextSchema` flags
on every tool. What's missing is the session shell that mounts multiple tools
side-by-side, owns the transport + the context provider, and exposes a "wires"
UI for cross-tool composition.

When that lands, you'll be able to:

- Mount the FM synth + the break sampler in one page under shared key/tempo
- Wire the grid-sampler's output pattern as the drum-machine's hihat input
- Hit "find scale" and let the scale-search agent pick a key based on the
  pitch content of whatever's currently playing

---

## Schemas reference (the contract)

All schemas live under `lib/`. They're Zod schemas — runtime-validated, with
TypeScript types inferred via `z.infer<>`. They are the source of truth.

| Schema | Path | What it validates |
|---|---|---|
| `PatternSchema` | `lib/pattern/schema.ts` | The universal step-sequencer document |
| `SynthSceneSchema` | `app/tools/evolving-fm-synth/lib/schema.ts` | The synth-scene document |
| `AgentManifestSchema` | `lib/agents/contract.ts` | Every tool's contract |
| `GlobalMusicContextSchema` | `lib/music/context.ts` | Session-wide BPM, swing, key, scale |
| `ScaleDefinitionSchema` | `lib/music/context.ts` | A tunable scale: 12tet/edo/cents/ratios |
| `InstrumentMusicContextSchema` | `lib/music/context.ts` | Per-tool opt-in flags for global context |
| `BuilderStreamChunkSchema` | `lib/agents/builder-contracts.ts` | Streaming events from the L2 builder |
| `GeneratePatternRequestSchema` | `lib/ai/contracts.ts` | The shape of `/api/generate` calls |

Adding new fields to `Pattern` or `SynthScene` is the lowest-cost way to
introduce new musical capabilities — every tool inherits them automatically,
and the L2 builder learns about them via `readSchema()`.

---

## Architecture

### Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router) | RSC route shells + `'use client'` islands; first-class browser-API support |
| Language | TypeScript 6, strict | The schema contracts only work with strict types |
| Audio | Tone.js 15 | Sample-accurate scheduling, internal lookahead-scheduler (Chris Wilson "Tale of Two Clocks"), `Tone.Offline()` for tests |
| AI | Vercel AI SDK v6 | `streamText` + `Output.object()` for structured output, `ToolLoopAgent` for tool-calling agents, reasoning streaming |
| AI gateway | Vercel AI Gateway | Provider-agnostic, OIDC-authenticated, dot-format model strings |
| Schemas | Zod 4 | Runtime validation + TS inference; the contract between tools, agents, and AI |
| State | Zustand 5 | Per-tool UI state; audio scheduling stays out of React |
| UI | Tailwind 4 + shadcn/ui + Geist Mono | Technical/minimal aesthetic — the concepts are the visible content, not the chrome |
| Testing | Vitest 4 + Playwright | Multi-project: `unit` (happy-dom) + `audio` (browser/chromium for `Tone.Offline`) |
| Property tests | fast-check | For pattern transforms and schema round-trips |
| API stubs | MSW | For deterministic AI-related tests |

### Folder layout

```
ai-daw-tools/
├── app/
│   ├── api/                   # Route handlers
│   │   ├── generate/          # Pattern generation (per-tool dispatch)
│   │   ├── build/             # L2 tool generation
│   │   ├── synth/             # SynthScene generation
│   │   ├── music/scale-search # Scale-search agent
│   │   └── suggestions/       # Prompt suggestions
│   ├── dashboard/             # Tool registry view
│   ├── build/                 # L2 builder UI
│   └── tools/<slug>/          # Each tool is a directory
├── lib/
│   ├── agents/                # AgentManifest, registry, sandbox, builder-tools, templates
│   ├── audio/                 # Tone.js wrappers, pattern→audio, BPM detection, WAV render
│   ├── ai/                    # Gateway, generation, tool-calling agents, contracts
│   ├── pattern/               # PatternSchema, defaults, URL codec
│   ├── music/                 # GlobalMusicContext, scale catalog, scale-agent, React hooks
│   └── samples/               # Sample library, IndexedDB upload, resolver
├── components/                # Shared UI: AudioBootstrap, SamplePicker, shadcn primitives
├── public/samples/            # Bundled CC0 samples
└── .audit/
    ├── generated-tools.json   # L2-generated manifest registry (committed)
    └── typecheck/             # Per-tool tsconfigs emitted by the builder
```

### How a pattern reaches your speakers

1. A tool collects a `Pattern` (manual edits, AI generation, URL hydration).
2. `lib/audio/pattern.ts` walks the pattern: a `Tone.Loop` ticks at the step
   interval; for each tick it iterates tracks and steps, checks
   `active`/`probability`/`conditions`, applies `microShift` as a time offset,
   resolves `sampleId`/`slot` via the sample resolver, and calls
   `Tone.Player.start(time + offset, sliceOffset, sliceDuration)`.
3. `Tone.getTransport()` is the singleton clock; BPM/swing live there.
4. `AudioBootstrap` (`components/audio-bootstrap.tsx`) ensures
   `Tone.start()` runs inside a user gesture before any audio code touches the
   `AudioContext`.
5. `Tone.Offline()` is used in tests to render the same pattern deterministically
   so we can assert event sequences without real-time playback.

### How an L2 generation works (full trace)

```
POST /api/build  { description, name?, slug?, referenceAgent?, register? }
   │
   ▼
app/api/build/handler.ts
   │  validates BuildToolRequestSchema
   │  calls runBuilderAgent(...) (or runBuilderToolLoopAgent for AI-driven)
   ▼
runBuilderAgent  (deterministic path)
   │  emit({ type: 'decision', message: 'using ${referenceAgent} as ref' })
   │  readSchema()                          → emit tool-call
   │  readToolFiles({ slug: referenceAgent })→ emit tool-call
   │  emit({ type: 'alternative', message: 'not modifying shared lib/...' })
   │  instantiateSkeleton({ slug, name, description })
   │     │  uses lib/agents/templates/tool-skeleton/files.ts
   │     │  renders manifest, page, client, prompt, tests
   │     │  writes each file via writeSandboxedFile → assertWithinTool
   │     └→ emit file chunks per write
   │  validateGeneratedManifest({ slug })   → emit tool-call + verification
   │  if (!register) → emit complete (unregistered)
   │  registerTool({ slug })
   │     │  validateGeneratedManifest (again, defensive)
   │     │  runToolTypecheck  → tsc -p .audit/typecheck/tsconfig.<slug>.json
   │     │  runToolTests      → vitest run --project unit app/tools/<slug>
   │     │  if any gate fails → emit verification(passed:false) + throw
   │     │  if all pass → writeGeneratedAgentManifest into .audit/generated-tools.json
   │     └→ emit verification(typecheck), verification(tests), complete
   ▼
The new tool appears at /tools/<slug> and on /dashboard.
```

A sandbox breach during any file write surfaces as a typed `breach` chunk:
`{ type: 'breach', message: 'writes restricted to app/tools/<slug>/; got <bad path>' }`.
The agent sees the error in its tool result and can either escalate or retry.

### Tool-to-tool composition (the design)

Two compatible documents compose **directly**: a `Pattern` from tool A
becomes an input track of tool B if they both declare
`instrument.document: 'pattern'`. URL codec, generation engine, and audio
engine all speak the same shape — no marshalling.

Cross-document composition uses **adapters**:

| From | To | Adapter |
|---|---|---|
| `Pattern` | `SynthScene` | Extract active steps as MIDI; assign to a voice; preserve velocity/probability |
| `SynthScene` | `Pattern` | Project active MIDI as triggers on a sampler track; lose voice/timbre info |
| Either | `audio-stream` | Record via `Tone.Recorder` over N bars |
| `audio-stream` | `Pattern` | Onset-detect; emit triggers at detected onsets |

This is what the planned `/sessions/[id]` wires UI exposes. Same-document
connections are free; cross-document connections show the adapter as a small
labeled node so the user knows what's being lost or transformed.

---

## Getting started

### Install

```bash
git clone <this-repo>
cd ai-daw-tools
pnpm install
```

### Configure your AI provider

For local dev, get a Vercel AI Gateway key:

```bash
echo 'AI_GATEWAY_API_KEY=...' > .env.local
# optional override
echo 'AI_GATEWAY_MODEL=anthropic/claude-sonnet-4.6' >> .env.local
```

For deployed environments, prefer OIDC:

```bash
vercel link
vercel env pull
```

The gateway then auths automatically via `VERCEL_OIDC_TOKEN`. No long-lived keys.

### Run

```bash
pnpm dev               # Next.js dev server
pnpm test              # Vitest, both projects
pnpm test:watch        # Watch mode
pnpm test:ui           # Vitest UI
pnpm typecheck         # tsc --noEmit
pnpm lint              # eslint
pnpm build             # production build
```

Open `http://localhost:3000`. The dashboard shows every registered tool.

### Deploy

```bash
vercel deploy --prod
```

Or click "Deploy to Vercel" from the repo. The audit log
(`.audit/generated-tools.json`) is intentionally committed, so generated tools
travel with the deployment.

---

## Roadmap

In short:

**Shipped:**
- V1 foundation, 4 hand-built sample tools, the FM synth
- L2 builder agent (deterministic + AI-driven paths)
- Three L2-generated tools live on the dashboard
- Global music context with microtonal scale support
- Scale-search AI agent and curated `ScaleDefinition` catalog
- Filesystem-driven registry, scoped per-tool typecheck, OIDC auth,
  multi-project Vitest

**Next, in order:**
1. **Track D — Per-step playback agency** (~3–5 days). Surface which steps
   fired, which were skipped (probability), which were nudged (microShift),
   which fills are gating in this bar — *live, during playback*. The
   "exposed agency" pitch finally extends into the audio domain.
2. **Track F — Microtonal sample playback** (~1 week). Add `pitchCents` and
   `tuningRef` to `StepSchema` so sample tools honor microtonal scales the
   way the FM synth already does.
3. **Track C — Multi-tool sessions** (~1–2 weeks). The `/sessions/[id]`
   route, shared context provider, cross-tool wires UI.
4. **Track H — Scale-search as generative loop** (~1 week). Capture playing
   audio, suggest scales, retune live.
5. **Track E — L3 builder** (~2 weeks). Capstone. An agent that produces
   specialized L2 builders for synth, effect, hybrid, microtonal domains.

Plus a longer-horizon set of optional tracks: audio-aware AI embeddings,
live regeneration, performance/show mode, WebMIDI output, audit-log review UI.

---

## Contributing

This is open source and bring-your-own-model. Contributions especially welcome
for:

- **New scales** — add a `ScaleDefinition` to `lib/music/scale-catalog.ts`.
  Microtonal, ethnomusicological, and mathematical scales are first-class.
- **New L1 tools** — drop a directory under `app/tools/<slug>/`; the registry
  picks it up. Use `intelligence-sampler` as a reference.
- **New adapters** — connect documents that don't yet talk to each other.
- **New AI providers** — extend `lib/ai/gateway.ts` or add a provider-specific
  module under `lib/ai/`.
- **The L3 builder** — see Track E above.
- **Per-step playback agency** — see Track D. Smallest cost, biggest impact.

The codebase is TDD-shaped. Every primitive ships with colocated tests:
`pnpm test` should be green before any PR.

### Project conventions

- Tools use `'use client'` islands inside RSC route shells. Audio code lives
  inside the client boundary; AI code lives in `'server-only'` modules.
- Manifests are validated at registry-load time. Invalid manifests log clearly
  and the tool is skipped (not a hard failure).
- L2-generated tools must pass `tsc --noEmit -p tsconfig.<slug>.json` and
  `vitest run --project unit app/tools/<slug>` before being registered.
- All AI calls go through `getGatewayModel()`. Don't construct provider
  clients directly — that breaks the swap-the-provider promise.
- Tests stub the AI provider via MSW. No live model calls in CI.

---

## Influences and prior art

This system is in conversation with a long lineage:

- **Tone.js**, Chris Wilson's "A Tale of Two Clocks," Mohayonao's Web Audio
  repos, the Web Audio API spec — the JS audio foundation.
- **Miller Puckette's *Theory and Techniques of Electronic Music*** — the
  Max/MSP and Pure Data approach to patcher-style composition. The
  "tools that build tools" framing is a Puckette inheritance.
- **Gordon Reid's *Synth Secrets*** (Sound on Sound, 1999–2007) — the
  synthesis literacy the FM synth's prompt builder leans on.
- **The Scala scale archive** and **the `tonal` library** — interop targets
  for the microtonal subsystem.
- **AudioCraft (MusicGen, AudioGen, EnCodec, MAGNeT, JASCO)** — the
  "agent environment for music" pitch from Meta AI Research that frames the
  multi-LLM orchestration possibilities.
- **"Interfaces after AI" — Tessitura** (Orpheus Instituut) — the working-register
  metaphor that informs the "exposed agency" thesis.

And in counterpoint:

- **Suno**, **Udio**, **MusicGen as a black-box product** — what this is
  trying *not* to be.

The system is a workshop, not a vending machine. The hope is that a
musician (or anyone curious) can read a generated pattern, understand
exactly why it sounds the way it does, edit it, share it, and push it
toward sounds that don't yet exist in anyone's training set.
