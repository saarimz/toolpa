import { audioBufferToDecoded } from "@/lib/samples/analysis/pipeline/decode";
import { analyzeSpectral } from "@/lib/samples/analysis/pipeline/spectral";
import { analyzeTonal } from "@/lib/samples/analysis/pipeline/tonal-rhythm";

export type AudioScaleEvidence = {
  key: string | null;
  keyStrength: number;
  pitchClasses: number[];
  scale: "major" | "minor" | null;
  summary: string;
};

const pitchClassNames = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

export function analyzeAudioBufferScaleEvidence(
  audioBuffer: AudioBuffer,
  {
    label = "rendered audio",
    maxPitchClasses = 8,
    minRelativeEnergy = 0.22,
  }: {
    label?: string;
    maxPitchClasses?: number;
    minRelativeEnergy?: number;
  } = {},
): AudioScaleEvidence | null {
  const decoded = audioBufferToDecoded(audioBuffer);
  const { frames } = analyzeSpectral(decoded.channels, decoded.sampleRate);
  const tonal = analyzeTonal(frames, decoded.sampleRate);
  const pitchClasses = getProminentPitchClasses(tonal.chroma_mean, {
    maxPitchClasses,
    minRelativeEnergy,
  });

  if (pitchClasses.length === 0) {
    return null;
  }

  const scaleLabel = tonal.key && tonal.scale ? `${tonal.key} ${tonal.scale}` : null;
  const classLabel = formatPitchClasses(pitchClasses);

  return {
    key: tonal.key,
    keyStrength: tonal.key_strength,
    pitchClasses,
    scale: tonal.scale,
    summary: scaleLabel
      ? `${label}: ${scaleLabel} (${Math.round(tonal.key_strength * 100)}% confidence), prominent ${classLabel}`
      : `${label}: prominent ${classLabel}`,
  };
}

function getProminentPitchClasses(
  chromaMean: number[],
  {
    maxPitchClasses,
    minRelativeEnergy,
  }: {
    maxPitchClasses: number;
    minRelativeEnergy: number;
  },
) {
  const maxEnergy = Math.max(...chromaMean, 0);
  if (maxEnergy <= 1e-9) {
    return [];
  }

  return chromaMean
    .map((energy, pitchClass) => ({ energy, pitchClass }))
    .filter((candidate) => candidate.energy >= maxEnergy * minRelativeEnergy)
    .sort(
      (left, right) =>
        right.energy - left.energy || left.pitchClass - right.pitchClass,
    )
    .slice(0, maxPitchClasses)
    .map((candidate) => candidate.pitchClass)
    .sort((left, right) => left - right);
}

function formatPitchClasses(values: number[]) {
  return values.map((value) => pitchClassNames[value] ?? String(value)).join(", ");
}
