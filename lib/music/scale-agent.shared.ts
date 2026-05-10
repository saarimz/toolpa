import { z } from "zod";

import { GlobalMusicContextSchema, TonicSchema } from "@/lib/music/context";
import {
  resolveScaleKey,
  searchScaleKeys,
  type ScaleKey,
} from "@/lib/music/scale-catalog";

export const ScaleAgentRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
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
  const results = searchScaleKeys(parsed.prompt, {
    tonic,
    limit: parsed.limit,
  });

  if (results.length >= Math.min(3, parsed.limit)) {
    return results;
  }

  const fallback = searchScaleKeys("minor dorian major pentatonic microtonal exotic", {
    tonic,
    limit: parsed.limit,
  });

  return [...results, ...fallback.filter((candidate) => !results.some((result) => result.id === candidate.id))]
    .slice(0, parsed.limit);
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
      rationale: `Matched "${parsed.prompt}" to ${selected.scale.name} via catalog tags: ${selected.scale.tags.slice(0, 4).join(", ") || selected.scale.family}.`,
    },
    alternatives: candidates.slice(1, 4).map((candidate) => ({
      tonic: candidate.tonic,
      scaleId: candidate.scale.id,
      rationale: `${candidate.scale.name} is a nearby option from ${candidate.scale.family}.`,
    })),
    querySummary: `Catalog search over ${candidates.length} candidate key/scale pairs.`,
  });
}
