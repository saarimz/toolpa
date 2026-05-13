# ai-daw-tools

AI-native browser instruments and builders.

## Start Here: Run The App Locally

The full builder workflow needs a local writable checkout. Vercel is suitable
only for a frozen/demo viewer of tools that are already committed to the repo.

To share the full app today, share this repository or a zip of it and have the
recipient run:

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

## Vercel Deployment

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
write generated tools to GitHub and redeploy from the committed branch, replace
source-file-generated tools with a dynamic `/tools/[slug]` renderer backed by
storage, or run the current app on a writable machine/container instead of
serverless functions.

The app is now centered on `/dashboard`. That page is the product surface: it
shows installed L1 instruments, generated L1 instruments, and the specialized L2
builders used to create or rebuild L1s.

## Product Model

| Level | Meaning | Routes |
| --- | --- | --- |
| L1 | Playable AI-native instruments and effects | `/tools/<slug>` |
| L2 | Builders that generate or rebuild L1 tools | `/build`, `/build/sample`, `/build/synth`, `/build/effect`, `/build/hybrid`, `/build/microtonal` |

There is no higher builder tier in the product. `AgentManifestSchema` accepts
only `level: 1` and `level: 2`.

## Dashboard

`/dashboard` is the primary catalog and health surface.

It provides:

- Primary filters for installed L1 tools, generated L1 tools, and L2 builders.
- Secondary filters by tool type and document type.
- Generated-tool audit status for manifest, route, test, and registry alignment.
- L1/L2 platform-hardening status for prompt input, serializable documents,
  audio/MIDI output, recording, route shape, sandbox, and builder verification
  gates.
- Rebuild links for generated L1 tools through `/build?edit=<slug>`.
- A visible gateway warning when `AI_GATEWAY_API_KEY` or Vercel OIDC auth is not configured.

## Installed L1 Instruments

Installed tools live under `app/tools/<slug>/` and export a validated
`agentManifest`.

Current installed L1 surfaces include:

- `intelligence-sampler`: prompt-assisted sample slicing and patterning.
- `splice-lab`: source interleaving and rhythmic splice loops.
- `grid-sampler`: directional 2D sample-grid traversal.
- `drum-machine`: probability and condition driven one-shot sequencing.
- `evolving-fm-synth`: SynthScene generation, macro editing, WAV render, and
  MIDI export.
- `camera-theremin`: prompt-selectable hand, gesture, face, eye, and body motion
  mapped into a scale-locked synth.
- `sample-analysis`: sample upload/library analysis with DSP features, AI
  descriptors, production ideas, and full-clip audition.
- `midi-generator`: prompt-driven standalone MIDI clips with global context
  sync, sine preview, visualization, and Standard MIDI export.

Current generated examples such as `sine-wave-synth` and
`harmonic-distrotion-effect` follow the same route and manifest contract as
installed L1 tools after they pass the generated-tool registration gates.

## L2 Builders

`/build` is the general L1 builder. It uses the LLM tool-loop builder path to
create new generated tools, and it can rebuild an existing generated tool when
opened with `?edit=<slug>`.

Specialized L2 builder profiles live in `lib/agents/builder-profiles.ts` and are
mounted at:

- `/build/sample`
- `/build/synth`
- `/build/effect`
- `/build/hybrid`
- `/build/microtonal`

Each profile constrains:

- Target instrument type.
- Target document type: `pattern`, `synth-scene`, or `audio-stream`.
- Reference tool.
- Template kit.
- Generated manifest requirements.
- Verification gates.
- Sandbox root.

The builders intentionally generate L1 tools, not new builder products.

## Generated Tool Contract

Generated tools must be rebuildable from source and registry metadata.

Every generated L1 should have:

- `app/tools/<slug>/manifest.ts`
- `app/tools/<slug>/page.tsx`
- `app/tools/<slug>/render.ts` exporting `renderOffline(document, durationSec)`
- `app/tools/<slug>/render.audio.test.ts` exercising the browser audio gate
- At least one colocated `*.test.ts` or `*.test.tsx`
- A registry entry in `.audit/generated-tools.json`
- A route matching `/tools/<slug>`
- A valid `AgentManifestSchema` with `origin: "generated"` and `level: 1`

The generated audit is implemented in `lib/agents/generated-audit.ts`. With file
checks enabled, it reconciles `.audit/generated-tools.json` with in-tree
generated manifests so a generated route cannot appear in the dashboard while
missing from the generated registry. It verifies that the registry and in-tree
manifest agree on slug, route, name, instrument type, workflow, document type,
and status. It also checks that the generated route is `/tools/<slug>` and that
the manifest declares the output matching its saved document contract. File
checks also require the offline renderer and browser audio-gate test so
generated tools prove audible, finite, unclipped output before they are
considered dashboard-ready.

The broader L1/L2 platform audit is implemented in
`lib/agents/platform-hardening.ts`. It translates the web-audio reference set
into source-enforced checks:

- L1 routes must mount at `/tools/<slug>`.
- L1 tools must expose prompt input, a serializable document output, audio
  output, recording output, and shared musical context.
- Discrete SynthScene L1 tools must declare `outputs.midi`, include
  `exportMidi`, and route the UI through the shared MIDI exporter. Continuous
  live synths such as `camera-theremin` keep recording/audio output instead of
  claiming a stable MIDI timeline.
- L1 descriptions must describe instruments, not builder tasks.
- L2 builders must mount under `/build`, accept description/reference-agent
  inputs, output files/manifests, and include `verifyTool` / `registerTool`.
- Specialized L2 profiles must cover the sample, synth, effect, hybrid, and
  microtonal domains with manifest, test, registry, sandbox, audio, and MIDI
  gates where relevant.

## MIDI Export

The MIDI framework lives in `lib/midi/`.

- `lib/midi/export.ts` writes deterministic Standard MIDI Files with tempo,
  4/4 timing, note on/off events, velocity, channel assignment, and pitch-bend
  cents for microtuned SynthScene steps.
- `lib/midi/synth-scene.ts` converts audible active SynthScene steps into MIDI
  notes and provides the browser download helper used by L1 synth surfaces.
- Synth and hybrid generated-tool templates include `download midi` next to WAV
  export, so rebuilt SynthScene tools keep the MIDI path automatically.

## Rebuild Flow

The rebuild path is deterministic around the model output:

1. `/dashboard` links generated tools to `/build?edit=<slug>`.
2. `/build` preloads the registry manifest and opens the builder in rebuild mode.
3. The client posts to `/api/build/edit`.
4. `runBuilderEditAgent` applies the edit in the generated tool sandbox.
5. The server validates the manifest, runs the static audit, typecheck, unit
   tests, and browser audio gate, snapshots generated files, registers the
   updated tool, and streams verification chunks back to the UI.

Registration is not left solely to the model. The server re-validates and
re-registers after a successful create or edit when registration is enabled. The
model can write files only through the sandbox; `.audit/generated-tools.json` is
rewritten server-side from the validated manifest.

## L2 Verification Gauntlet

Generated registration is gated in `lib/agents/builder-tools.ts`:

1. `validateManifest` parses `app/tools/<slug>/manifest.ts` through
   `AgentManifestSchema`.
2. `runToolStaticAudit` checks required files, the client boundary, disallowed
   imports/storage/exfiltration primitives, module-level audio construction, and
   placeholder output.
3. `runToolTypecheck` runs a scoped per-tool `tsc --noEmit` config.
4. `runToolTests` runs scoped Vitest unit coverage for the generated tool.
5. `runToolAudioGate` runs `render.audio.test.ts` in the browser audio project,
   which calls `renderOffline` and analyzes RMS, peak, NaN/Infinity, clipping,
   and duration through `lib/audio/offline-analysis.ts`.
6. `snapshotGeneratedTool` stores accepted generated files under
   `.audit/snapshots/<slug>/` before the registry projection is updated.

## Audio Hardening Notes

This app follows a few browser-audio lessons from existing web synth projects:

- Tone.js documents that browser audio must start from a user action and that
  scheduled callbacks should use the audio-context time passed into the event:
  https://github.com/Tonejs/Tone.js
- Web Audio Modules separate plugin entrypoint, audio node creation, and GUI
  creation. Generated tools should keep manifest, audio graph, and UI contracts
  similarly explicit: https://github.com/webaudiomodules/sdk
- Web Synth treats the Web Audio graph as the backbone and keeps save/load state
  serializable. Generated tools should keep their Pattern, SynthScene, or patch
  JSON inspectable: https://github.com/Ameobea/web-synth
- Strudel keeps browser-native musical patterns directly editable. L1 tools
  should expose generated musical documents rather than hiding all output inside
  transient audio nodes: https://strudel.cc/learn/getting-started/

## Gateway Model

The default AI Gateway model is:

```bash
AI_GATEWAY_MODEL=deepseek/deepseek-v4-flash
```

Set `AI_GATEWAY_API_KEY` in `.env.local`, or use Vercel OIDC auth in deployment.

## Development

```bash
pnpm install --frozen-lockfile
pnpm dev --port 3010
```

Open:

```text
http://localhost:3010/dashboard
```

## Verification

Run the focused checks while changing builder or dashboard behavior:

```bash
pnpm test:unit app/dashboard/tool-suite-dashboard.test.tsx app/tools/_builder/client.test.tsx lib/agents/builder-profiles.test.ts lib/agents/generated-audit.test.ts lib/agents/registry.test.ts lib/agents/contract.test.ts app/api/build/edit/handler.test.ts
```

Run the full repo checks before handing off:

```bash
pnpm test:unit
pnpm typecheck
pnpm lint
```

For generated-tool hardening, also run a content audit for removed product
routes and labels across `app`, `lib`, `components`, and `README.md`. Product
code should not reference removed route families or removed builder-tier labels.
