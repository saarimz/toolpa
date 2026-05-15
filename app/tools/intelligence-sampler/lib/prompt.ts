import type { Pattern } from "@/lib/pattern/schema";
import type { AiSampleContext } from "@/lib/ai/sample-context";
import type { GlobalMusicContext } from "@/lib/music/context";
import { getScaleDefinition } from "@/lib/music/scale-catalog";

export type IntelligenceSamplerPromptInput = {
  pattern: Pattern;
  sample: Pick<AiSampleContext, "id" | "name" | "pack" | "role" | "estimatedBpm">;
  bpm: number;
  swing: number;
  vibe: string;
  musicalContext?: GlobalMusicContext;
};

export function buildIntelligenceSamplerSystemPrompt() {
  return [
    "You are an L1 intelligence-sampler agent inside toolpa.",
    "Return only structured Pattern output that matches the provided schema.",
    "Expose decisions in metadata.rationale; do not rely on hidden chain of thought.",
    "Use active steps, velocity, probability, microShift, conditions, slot, pitchSemitones, pitchCents, tuningRef, decay, reverse, repeats, track-level chokeGroup defaults, and per-step chokeGroup overrides when musically useful.",
    "For intelligence-sampler tracks, keep eight tracks named slice 1 through slice 8 and target slots 0 through 7.",
    "Adapt to the selected sample role; do not assume every source is a Jungle Jungle break.",
  ].join("\n");
}

export function buildIntelligenceSamplerPrompt(input: IntelligenceSamplerPromptInput) {
  const scale = input.musicalContext
    ? getScaleDefinition(input.musicalContext.key.scaleId)
    : null;
  const compactPattern = input.pattern.tracks
    .map((track) => {
      const activeSteps = track.steps
        .map((step, index) => (step.active ? `${index}:${step.slot ?? track.slot ?? 0}` : null))
        .filter(Boolean)
        .join(" ");
      return `${track.name} -> ${activeSteps || "empty"}`;
    })
    .join("\n");

  return [
    `Tool: intelligence-sampler`,
    `Sample: ${input.sample.name} (${input.sample.pack}, ${input.sample.role})`,
    `Sample id: ${input.sample.id}`,
    `Tempo: ${input.bpm} BPM`,
    `Swing: ${input.swing}`,
    scale
      ? `Global key: ${input.musicalContext?.key.tonic} ${scale.name}; use tuningRef degrees or pitchCents for scale-aware sample pitching${scale.microtonal ? ` (${scale.family})` : ""}.`
      : null,
    `User direction: ${input.vibe || "make a useful chopped sample pattern"}`,
    "",
    "Current pattern:",
    compactPattern,
    "",
    "Pattern requirements:",
    "- schemaVersion must be 1",
    "- bpm, swing, bars, stepsPerBar must stay coherent with the request",
    "- each track must use the selected sampleId unless a step explicitly overrides it",
    "- slot picks the slice index; valid intelligence-sampler slots are 0 through 7",
    "- if the sample is a loop, pad, melodic source, or fx texture, use longer decays, fewer busy retriggers, and pitch/reverse changes where appropriate",
    "- microShift is a fraction of the step duration from -0.5 to 0.5",
    "- probability is 0 to 1",
    "- conditions can be everyN, firstOfN, or notFirstOfN",
    "- chokeGroup makes any new trigger in that group stop the previous sound in the same group; set it on tracks for defaults and on steps for overrides",
    "- metadata.rationale should be a short visible decision summary",
  ].filter(Boolean).join("\n");
}
