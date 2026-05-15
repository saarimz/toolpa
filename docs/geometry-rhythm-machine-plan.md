# Geometry Rhythm Machine Plan

## Research Map

- Represent rhythm as a cyclic binary string: each pulse is either an onset or a rest. Toussaint's geometric framing uses a clock/circle and regular-polygon vertices for cyclic rhythm.
- Treat rotations as first-class. The same binary string under rotation is a necklace, but playback orientation still matters in polyrhythmic music.
- Generate timelines with Euclidean/Bjorklund construction: `E(k, n)` distributes `k` onsets over `n` pulses and maps directly to many traditional timelines.
- Preserve style examples as explicit formulas. Bossa nova maps to the `E(5, 16)` necklace, with common rotations; tresillo maps to `E(3, 8)`; cinquillo maps to `E(5, 8)`; samba maps to `E(7, 16)`; bembe maps to `E(7, 12)`.
- Analyze every generated ring with computable metrics: inter-onset intervals, full interval vector, evenness, off-beatness, rhythmic oddity, complement, and rotation.
- Keep the musical caveat visible in the implementation: geometry is a useful symbolic model, while meter, timbre, and performance feel still matter.

## Build Map

1. `app/tools/drum-machine/lib/geometry.ts`
   - Add pure math utilities for Euclidean rhythm generation, rotation, necklaces, interval vectors, evenness, off-beatness, oddity, complement, and prompt-to-plan resolution.
   - Convert a resolved geometry plan into the existing shared `Pattern` schema so sample playback, trace, and WAV export keep working.

2. `app/tools/drum-machine/lib/geometry.test.ts`
   - Prove the known formulas: bossa nova prompt resolves to `E(5,16)` with a rotated necklace; tresillo resolves to `E(3,8)`; oddity/off-beatness/interval metrics are deterministic.

3. `app/tools/drum-machine/components/circular-rhythm.tsx`
   - Add the circular interface: one ring per track, pulse dots around the circumference, active onsets connected as polygons, and metrics displayed next to each ring.
   - Provide ring controls for `hits`, `rotation`, and a regenerate action so the math is editable without leaving the instrument.

4. `app/tools/drum-machine/store.ts`
   - Add actions that apply a geometry plan and regenerate an individual track from `E(k,n,rotation)` without breaking manual step editing.

5. `app/tools/drum-machine/components/generation-panel.tsx`
   - Keep the existing LLM workflow, but add a deterministic "apply math" action that turns natural-language prompts into explicit geometry steps before playback.
   - Show the resolved formula plan so a prompt like "bossa nova swing rhythm" becomes inspectable math instead of an opaque generation.

6. `app/tools/drum-machine/lib/prompt.ts` and `lib/agents/dispatch.ts`
   - Prime LLM generation to return geometry-compatible pattern metadata and use exact formulas where the prompt names known rhythm families.

7. `app/tools/drum-machine/manifest.ts`
   - Update capabilities and description to advertise circular geometry, Euclidean timelines, and deterministic prompt mapping.

## Verification

- Run focused unit tests for the geometry math and drum-machine React components.
- Run prompt tests to confirm the LLM prompt advertises the mathematical contract.
- Run typecheck if the focused suite passes.
- Run a browser smoke on `/tools/drum-machine` to confirm the circular interface renders and basic controls work.

## Source Notes

- Toussaint, "The Geometry of Musical Rhythm": cyclic clock representation, binary/box notation, inter-onset intervals, evenness, and polygon geometry.
- Toussaint, "The Euclidean Algorithm Generates Traditional Musical Rhythms": Bjorklund/Euclidean construction, necklace rotations, and examples including `E(5,16)` bossa nova.
- Toussaint, "Generating Good Musical Rhythms Algorithmically": circular reflection, complement, alternating-hands/toggle framing.
- Reviews and follow-up summaries are useful for caveats around applying geometric measures directly to meter and musical "goodness."
