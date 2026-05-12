import { z } from "zod";

import { GlobalMusicContextSchema, TonicSchema } from "@/lib/music/context";
import {
  getScaleKeys,
  getScaleSemitoneApproximation,
  resolveScaleKey,
  searchScaleKeys,
  type ScaleKey,
} from "@/lib/music/scale-catalog";

export const ScaleAgentRequestSchema = z.object({
  evidenceSummary: z.string().min(1).max(1200).optional(),
  prompt: z.string().min(1).max(1000),
  pitchClasses: z.array(z.number().int().min(0).max(11)).max(24).optional(),
  relativePitchClasses: z.array(z.number().int().min(0).max(11)).max(24).optional(),
  tonic: TonicSchema.optional(),
  context: GlobalMusicContextSchema.optional(),
  limit: z.number().int().min(3).max(24).default(12),
});

export const ScaleAgentChoiceSchema = z.object({
  tonic: TonicSchema,
  scaleId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  rationale: z.string().min(1).max(500),
});

export const ScaleAgentOutputSchema = z.object({
  selected: ScaleAgentChoiceSchema,
  alternatives: z.array(ScaleAgentChoiceSchema).min(0).max(5).default([]),
  querySummary: z.string().min(1).max(500),
});

export type ScaleAgentRequest = z.infer<typeof ScaleAgentRequestSchema>;
export type ScaleAgentChoice = z.infer<typeof ScaleAgentChoiceSchema>;
export type ScaleAgentOutput = z.infer<typeof ScaleAgentOutputSchema>;

export function getScaleAgentCandidates(input: ScaleAgentRequest): ScaleKey[] {
  const parsed = ScaleAgentRequestSchema.parse(input);
  const tonic = parsed.tonic ?? parsed.context?.key.tonic;
  const pitchResults = getPitchFitCandidates(parsed);
  const results = searchScaleKeys(parsed.prompt, {
    tonic,
    limit: parsed.limit,
  });
  const combinedResults = uniqueScaleKeys([...pitchResults, ...results]).slice(
    0,
    parsed.limit,
  );

  if (combinedResults.length >= Math.min(3, parsed.limit)) {
    return combinedResults;
  }

  const fallback = searchScaleKeys("minor dorian major pentatonic microtonal exotic", {
    tonic,
    limit: parsed.limit,
  });

  return uniqueScaleKeys([...combinedResults, ...fallback]).slice(0, parsed.limit);
}

export function buildScaleAgentPrompt(input: ScaleAgentRequest, candidates: ScaleKey[]) {
  const currentScale = input.context
    ? resolveScaleKey({
        tonic: input.context.key.tonic,
        scaleId: input.context.key.scaleId,
      })
    : null;

  return [
    `User vibe: ${input.prompt}`,
    input.tonic ? `Requested tonic: ${input.tonic}` : null,
    currentScale
      ? `Current global context: ${currentScale.label}, ${input.context?.bpm} BPM, swing ${input.context?.swing}`
      : null,
    input.evidenceSummary ? `Generated artifact evidence: ${input.evidenceSummary}` : null,
    input.pitchClasses?.length
      ? `Observed absolute pitch classes: ${formatPitchClasses(input.pitchClasses)}`
      : null,
    input.relativePitchClasses?.length
      ? `Observed relative pitch offsets: ${formatPitchClasses(input.relativePitchClasses)}`
      : null,
    "",
    "Candidate keys and scales:",
    ...candidates.map((candidate, index) =>
      [
        `${index + 1}. ${candidate.tonic} ${candidate.scale.name}`,
        `id: ${candidate.scale.id}`,
        `family: ${candidate.scale.family}`,
        `tags: ${candidate.scale.tags.join(", ") || "none"}`,
        `microtonal: ${candidate.scale.microtonal ? "yes" : "no"}`,
        `description: ${candidate.scale.description}`,
      ].join(" | "),
    ),
    "",
    "Pick the one key/scale that best matches the vibe and explain why in audible terms.",
    "Use only candidate scale ids from the list. Alternatives should be genuinely different colors.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function createDeterministicScaleChoice(input: ScaleAgentRequest): ScaleAgentOutput {
  const parsed = ScaleAgentRequestSchema.parse(input);
  const candidates = getScaleAgentCandidates(parsed);
  const selected = candidates[0] ?? resolveScaleKey({
    tonic: parsed.tonic ?? parsed.context?.key.tonic ?? "C",
    scaleId: parsed.context?.key.scaleId ?? "minor",
  });

  return ScaleAgentOutputSchema.parse({
    selected: {
      tonic: selected.tonic,
      scaleId: selected.scale.id,
      rationale: parsed.evidenceSummary
        ? `Matched generated artifact evidence to ${selected.scale.name}: ${parsed.evidenceSummary}`
        : `Matched "${parsed.prompt}" to ${selected.scale.name} via catalog tags: ${selected.scale.tags.slice(0, 4).join(", ") || selected.scale.family}.`,
    },
    alternatives: candidates.slice(1, 4).map((candidate) => ({
      tonic: candidate.tonic,
      scaleId: candidate.scale.id,
      rationale: `${candidate.scale.name} is a nearby option from ${candidate.scale.family}.`,
    })),
    querySummary: `Catalog search over ${candidates.length} candidate key/scale pairs.`,
  });
}

function getPitchFitCandidates(input: ScaleAgentRequest): ScaleKey[] {
  const absolutePitchClasses = normalizePitchClasses(input.pitchClasses ?? []);
  const relativePitchClasses = normalizePitchClasses(input.relativePitchClasses ?? []);
  if (absolutePitchClasses.length === 0 && relativePitchClasses.length === 0) {
    return [];
  }

  const tonic = input.tonic ?? input.context?.key.tonic;
  return getScaleKeys()
    .filter((key) => !tonic || key.tonic === tonic)
    .map((key) => ({
      key,
      score: scorePitchFit(key, {
        absolutePitchClasses,
        relativePitchClasses,
      }),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.key.label.localeCompare(right.key.label))
    .slice(0, input.limit)
    .map((candidate) => candidate.key);
}

function scorePitchFit(
  key: ScaleKey,
  {
    absolutePitchClasses,
    relativePitchClasses,
  }: {
    absolutePitchClasses: number[];
    relativePitchClasses: number[];
  },
) {
  const scaleRelative = getScaleSemitoneApproximation(key.scale.id);
  const tonicPitchClass = tonicToPitchClass(key.tonic);
  const scaleAbsolute = scaleRelative.map((pitchClass) =>
    mod(tonicPitchClass + pitchClass, 12),
  );
  return (
    scorePitchClassSet(relativePitchClasses, scaleRelative) +
    scorePitchClassSet(absolutePitchClasses, scaleAbsolute) -
    (key.scale.microtonal ? 3 : 0)
  );
}

function scorePitchClassSet(observed: number[], scalePitchClasses: number[]) {
  if (observed.length === 0) {
    return 0;
  }

  const scaleSet = new Set(scalePitchClasses.map((pitchClass) => mod(pitchClass, 12)));
  const matched = observed.filter((pitchClass) => scaleSet.has(pitchClass)).length;
  const missed = observed.length - matched;
  const extraScaleTones = Math.max(0, scaleSet.size - observed.length);
  const diatonicBonus = scaleSet.size === 7 ? 2 : 0;
  const exactSizeBonus =
    missed === 0 && observed.length === scaleSet.size ? Math.max(1, observed.length) : 0;

  return matched * 6 - missed * 4 - extraScaleTones + diatonicBonus + exactSizeBonus;
}

function uniqueScaleKeys(candidates: ScaleKey[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) {
      return false;
    }
    seen.add(candidate.id);
    return true;
  });
}

function normalizePitchClasses(values: number[]) {
  return [...new Set(values.map((value) => mod(value, 12)))].sort(
    (left, right) => left - right,
  );
}

function formatPitchClasses(values: number[]) {
  const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  return normalizePitchClasses(values)
    .map((value) => names[value] ?? String(value))
    .join(", ");
}

function tonicToPitchClass(tonic: string) {
  const pitchClasses: Record<string, number> = {
    C: 0,
    "C#": 1,
    Db: 1,
    D: 2,
    "D#": 3,
    Eb: 3,
    E: 4,
    F: 5,
    "F#": 6,
    Gb: 6,
    G: 7,
    "G#": 8,
    Ab: 8,
    A: 9,
    "A#": 10,
    Bb: 10,
    B: 11,
  };

  return pitchClasses[tonic] ?? 0;
}

function mod(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}
