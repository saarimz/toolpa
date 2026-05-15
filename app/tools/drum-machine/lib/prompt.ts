import type { Pattern } from "@/lib/pattern/schema";
import type { AiSampleContext } from "@/lib/ai/sample-context";
import type {
  DrumSampleMode,
  DrumTrackSampleContext,
} from "@/lib/ai/contracts";

export function buildDrumMachineSystemPrompt() {
  return [
    "You are the drum-machine L1 agent inside toolpa.",
    "Return a valid Pattern JSON object only.",
    "Treat rhythm as cyclic geometry: binary strings on a circle, necklaces under rotation, and polygons connecting active onsets.",
    "Use exact Euclidean formulas when named: bossa nova is E(5,16) as a rotated necklace, tresillo is E(3,8), cinquillo is E(5,8), samba is E(7,16), and bembe is E(7,12).",
    "Use multiple tracks, independent step lengths for polyrhythm, probability, conditions, pitchSemitones, pitchCents, tuningRef, decay, repeats, and chokeGroup.",
    "Put a compact visible rationale in metadata.rationale.",
  ].join("\n");
}

export function buildDrumMachinePrompt({
  pattern,
  sample,
  sampleMode = "slice",
  trackSamples = [],
  vibe,
}: {
  pattern: Pattern;
  sample: AiSampleContext;
  sampleMode?: DrumSampleMode;
  trackSamples?: DrumTrackSampleContext[];
  vibe: string;
}) {
  return [
    `vibe: ${vibe}`,
    `sample: ${sample.name} (${sample.pack}, ${sample.role})`,
    `sample mode: ${sampleMode}`,
    buildTrackSamplesLine(trackSamples),
    `current pattern: ${JSON.stringify(pattern)}`,
    "Mutate or regenerate the groove while preserving sample ids. Track steps may be 5, 7, 8, 9, 11, 12, 13, 15, 16, 24, or 32 long.",
    sampleMode === "multi"
      ? "Multi-sample mode: each lane owns its track.sampleId. Preserve each listed track sample id unless the user explicitly asks to replace that lane."
      : "Slice mode: all lanes share the same source sample. Vary track.slot or step.slot to split that single sample across tracks.",
    "If the prompt names a world rhythm, encode the math explicitly in metadata.rationale, including E(k,n), rotation, inter-onset interval vector, and whether the result is a known necklace or direct onset list.",
    "Use chokeGroup to keep hats, kicks, snares, or sliced one-shot lanes from smearing when the groove gets dense.",
  ].filter(Boolean).join("\n");
}

function buildTrackSamplesLine(trackSamples: DrumTrackSampleContext[]) {
  if (trackSamples.length === 0) {
    return "";
  }

  return `lane samples: ${trackSamples
    .map((track) =>
      [
        track.trackName ?? track.trackId,
        track.sampleName ?? track.sampleId,
        track.sampleRole ?? "unknown",
        track.sampleId,
      ].join(" / "),
    )
    .join("; ")}`;
}
