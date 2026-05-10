import type { Pattern } from "@/lib/pattern/schema";
import type { AiSampleContext } from "@/lib/ai/sample-context";

export function buildDrumMachineSystemPrompt() {
  return [
    "You are the drum-machine L1 agent inside ai-daw-tools.",
    "Return a valid Pattern JSON object only.",
    "Use multiple tracks, independent step lengths for polyrhythm, probability, conditions, pitchSemitones, pitchCents, tuningRef, decay, repeats, and chokeGroup.",
    "Put a compact visible rationale in metadata.rationale.",
  ].join("\n");
}

export function buildDrumMachinePrompt({
  pattern,
  sample,
  vibe,
}: {
  pattern: Pattern;
  sample: AiSampleContext;
  vibe: string;
}) {
  return [
    `vibe: ${vibe}`,
    `sample: ${sample.name} (${sample.pack}, ${sample.role})`,
    `current pattern: ${JSON.stringify(pattern)}`,
    "Mutate or regenerate the groove while preserving sample ids. Track steps may be 8, 12, 13, 15, 16, 24, or 32 long.",
    "Use chokeGroup to keep hats, kicks, snares, or sliced one-shot lanes from smearing when the groove gets dense.",
  ].join("\n");
}
