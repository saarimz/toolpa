import { SpliceSourceKeys } from "@/app/tools/splice-lab/lib/pattern";
import {
  createPattern,
  createStep,
  createTrack,
  type Pattern,
  type Track,
} from "@/lib/pattern/schema";

type LocalSplicePatternInput = {
  pattern: Pattern;
  prompt: string;
  sliceCount: number;
  variant?: number;
};

export function createLocalSplicePattern({
  pattern,
  prompt,
  sliceCount,
  variant = 0,
}: LocalSplicePatternInput): Pattern {
  const safeSliceCount = Math.max(1, Math.min(64, Math.round(sliceCount)));
  const sourceTracks = getSpliceSourceTracks(pattern);
  const totalSteps = Math.max(
    safeSliceCount,
    pattern.bars * pattern.stepsPerBar,
    sourceTracks[0]?.steps.length ?? 16,
  );
  const normalizedPrompt = prompt.toLowerCase();
  const sparse =
    normalizedPrompt.includes("sparse") ||
    normalizedPrompt.includes("breakdown") ||
    normalizedPrompt.includes("space");
  const callResponse =
    normalizedPrompt.includes("call") ||
    normalizedPrompt.includes("response") ||
    normalizedPrompt.includes("answer");
  const dense =
    normalizedPrompt.includes("dense") ||
    normalizedPrompt.includes("stutter") ||
    normalizedPrompt.includes("glitch");
  const reverse =
    normalizedPrompt.includes("reverse") ||
    normalizedPrompt.includes("tape") ||
    normalizedPrompt.includes("drift");

  const tracks = sourceTracks.map((track, sourceIndex) =>
    createTrack({
      id: track.id,
      name: track.name,
      sampleId: track.sampleId,
      role: track.role,
      chokeGroup: "splice-switch",
      steps: Array.from({ length: totalSteps }, (_, stepIndex) => {
        const selectedSource = chooseSourceIndex({
          callResponse,
          dense,
          sourceCount: sourceTracks.length,
          sparse,
          stepIndex,
          variant,
        });
        const active = selectedSource === sourceIndex;
        const phrase = Math.floor(stepIndex / 4);

        return createStep({
          active,
          slot:
            (stepIndex * (sourceIndex + 1) + phrase * 2 + variant * 3) %
            safeSliceCount,
          velocity: active ? (stepIndex % 8 === 0 ? 1 : 0.78) : 0,
          probability: active && sparse && stepIndex % 8 === 5 ? 0.72 : 1,
          microShift: active ? ((stepIndex + sourceIndex) % 3 === 0 ? -0.02 : 0.015) : 0,
          pitchSemitones: active && !dense && stepIndex % 16 === 14 ? 7 : 0,
          decay: active ? (dense ? 0.42 : 0.68) : 0,
          reverse: active && reverse && stepIndex % 8 === 7,
          repeats: active && dense && stepIndex % 4 === 3 ? 2 : 1,
          chokeGroup: "splice-switch",
        });
      }),
    }),
  );

  return createPattern({
    id: `${pattern.id}-local-splice`,
    name: "local splice map",
    bpm: pattern.bpm,
    swing: pattern.swing,
    bars: Math.max(1, Math.min(16, Math.ceil(totalSteps / pattern.stepsPerBar))),
    stepsPerBar: pattern.stepsPerBar,
    tracks,
    metadata: {
      ...pattern.metadata,
      toolSlug: "splice-lab",
      createdBy: "ai",
      rationale:
        "Local splice fallback built a deterministic multi-source choke map after the gateway did not return a usable pattern.",
      tags: uniqueTags([...(pattern.metadata.tags ?? []), "splice", "local-agent", "fallback"]),
    },
  });
}

function getSpliceSourceTracks(pattern: Pattern): Track[] {
  const sourceTracks = pattern.tracks.filter((track) =>
    /^source-[a-z]$/i.test(track.id),
  );

  return (sourceTracks.length >= 2 ? sourceTracks : pattern.tracks).slice(
    0,
    SpliceSourceKeys.length,
  );
}

function chooseSourceIndex({
  callResponse,
  dense,
  sourceCount,
  sparse,
  stepIndex,
  variant,
}: {
  callResponse: boolean;
  dense: boolean;
  sourceCount: number;
  sparse: boolean;
  stepIndex: number;
  variant: number;
}) {
  if (sparse && (stepIndex % 4 === 1 || stepIndex % 8 === 6)) {
    return -1;
  }

  if (callResponse) {
    return (Math.floor(stepIndex / 4) + variant) % sourceCount;
  }

  if (dense) {
    return (stepIndex + Math.floor(stepIndex / 2) + variant) % sourceCount;
  }

  return (stepIndex + Math.floor(stepIndex / 4) + variant) % sourceCount;
}

function uniqueTags(tags: string[]) {
  return Array.from(new Set(tags));
}
