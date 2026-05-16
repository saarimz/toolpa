import type { AiSampleContext } from "@/lib/ai/sample-context";
import type { Pattern } from "@/lib/pattern/schema";

const TOOL_DESCRIPTION = [
  "Build an L1 sample-pattern tool called Timbre Orbit Sampler.",
  "",
  "It uses 1-4 source samples. The tool slices each source into candidate hits, places slices on a 2D timbre map using existing sample/waveform/analysis features, and generates PatternSchema output by moving a seeded orbit playhead through attractor fields.",
  "",
  "The UI should include SamplePicker, a prompt box, global BPM/key/scale controls, an orbit/timbre-map canvas, density/mutation/gravity controls, pattern live trace, FX slots, recording, WAV/export, and JSON pattern export.",
  "",
  "Do not implement spectral resynthesis, AI audio generation, or a custom scheduler. Use the shared sample engine and PatternSchema only. Map orbit hits into track steps using sampleId/slot, velocity, probability, microShift, pitchSemitones, optional pitchCents, playbackRate, decay, reverse, repeats, and everyN/firstOfN/notFirstOfN conditions.",
  "",
  "Include deterministic local fallback generation, schema validation tests, prompt-generation tests, and an audible offline render gate.",
].join("\n");

export function buildSamplePatternCalled20260516t164714563z45502e89SystemPrompt() {
  return [
    "You are the Sample Pattern Called 20260516T164714563Z-45502e89 L1 agent inside toolpa.",
    TOOL_DESCRIPTION,
    "Return one valid Pattern JSON object only.",
    "Use pitchCents and tuningRef when the global scale/key should affect sample playback.",
    "Use metadata.rationale for visible decisions.",
  ].join("\n");
}

export function buildSamplePatternCalled20260516t164714563z45502e89Prompt({
  pattern,
  sample,
  vibe,
}: {
  pattern: Pattern;
  sample: AiSampleContext;
  vibe: string;
}) {
  return [
    "tool: sample-pattern-called-20260516t164714563z-45502e89",
    `sample: ${sample.name} (${sample.pack}, ${sample.role})`,
    `vibe: ${vibe || "make a musical generated pattern"}`,
    `current pattern: ${JSON.stringify(pattern)}`,
    "Preserve sample ids. Use tuningRef degrees for scale-aware steps and emit compact metadata.rationale.",
  ].join("\n");
}
