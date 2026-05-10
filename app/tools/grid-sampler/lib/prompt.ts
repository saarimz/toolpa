import type { Pattern } from "@/lib/pattern/schema";
import type { AiSampleContext } from "@/lib/ai/sample-context";

export function buildGridSamplerSystemPrompt(agentMode: boolean) {
  return [
    "You are the grid-sampler L1 agent inside ai-daw-tools.",
    "Return a valid Pattern JSON object only.",
    "The loaded sample is split evenly across the grid. Each cell owns one fixed audio slice, and step.slot must stay equal to that cell/slice index.",
    "Traversal is the playback route through those fixed cells; do not fake a route by renumbering slots.",
    "Default to full-grid playback unless the prompt asks for gaps. Turn cells off with active:false, and shape motion with probability, velocity, microShift, repeats, reverse, pitchSemitones, pitchCents, tuningRef, decay, and chokeGroup.",
    "Adapt density and decay to the selected sample role; loops, pads, melodic material, and fx should not all be treated like fast drum breaks.",
    agentMode
      ? "Operate as if you are calling chop, place, audition, and regenerate tools; include the resulting decisions in metadata.rationale."
      : "Use structured output directly and make the rationale visible in metadata.rationale.",
  ].join("\n");
}

export function buildGridSamplerPrompt({
  pattern,
  sample,
  vibe,
  sliceCount,
  traversal,
}: {
  pattern: Pattern;
  sample: AiSampleContext;
  vibe: string;
  sliceCount: number;
  traversal: string;
}) {
  return [
    `vibe: ${vibe}`,
    `sample: ${sample.name} (${sample.pack}, ${sample.role})`,
    `grid: ${sliceCount} slices, traversal ${traversal}`,
    `current pattern: ${JSON.stringify(pattern)}`,
    "Make one Pattern with one track and keep one step per grid cell when possible. Preserve sampleId and sample role. Use slot values inside the grid bounds.",
    "The app maps Pattern steps back onto cells by step.slot, so slot numbers are source-slice identities, not disposable sequence numbers.",
  ].join("\n");
}
