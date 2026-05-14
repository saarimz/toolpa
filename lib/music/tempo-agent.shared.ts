import { z } from "zod";

import {
  GlobalBpmSchema,
  GlobalMusicContextSchema,
  GlobalSwingSchema,
} from "@/lib/music/context";

export const TempoAgentRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
  context: GlobalMusicContextSchema.optional(),
});

export const TempoAgentChoiceSchema = z.object({
  bpm: GlobalBpmSchema,
  swing: GlobalSwingSchema,
  rationale: z.string().min(1).max(500),
});

export const TempoAgentOutputSchema = z.object({
  selected: TempoAgentChoiceSchema,
  alternatives: z.array(TempoAgentChoiceSchema).min(0).max(4).default([]),
  querySummary: z.string().min(1).max(500),
});

export type TempoAgentRequest = z.infer<typeof TempoAgentRequestSchema>;
export type TempoAgentChoice = z.infer<typeof TempoAgentChoiceSchema>;
export type TempoAgentOutput = z.infer<typeof TempoAgentOutputSchema>;

type TempoBand = {
  id: string;
  label: string;
  bpm: number;
  swing: number;
  tags: string[];
  rationale: string;
};

const tempoBands: TempoBand[] = [
  band("jungle", "Jungle / drum and bass", 168, 0.07, [
    "jungle",
    "dnb",
    "drum",
    "bass",
    "breakbeat",
    "breakcore",
    "amen",
  ]),
  band("garage", "UK garage / 2-step", 134, 0.16, [
    "garage",
    "ukg",
    "2step",
    "2-step",
    "shuffle",
  ]),
  band("house", "House", 124, 0.05, [
    "house",
    "deep",
    "disco",
    "club",
    "four",
    "floor",
  ]),
  band("techno", "Techno", 132, 0.02, [
    "techno",
    "warehouse",
    "industrial",
    "rave",
    "acid",
  ]),
  band("hip-hop", "Hip-hop / boom bap", 88, 0.14, [
    "hip",
    "hop",
    "hiphop",
    "boom",
    "bap",
    "rap",
    "lofi",
  ]),
  band("trap", "Trap", 142, 0.08, [
    "trap",
    "drill",
    "808",
    "rage",
    "atlanta",
  ]),
  band("footwork", "Footwork / juke", 158, 0.05, [
    "footwork",
    "juke",
    "jersey",
    "baltimore",
  ]),
  band("dub", "Dub / reggae", 74, 0.12, [
    "dub",
    "reggae",
    "ska",
    "dancehall",
    "roots",
  ]),
  band("ambient", "Ambient / cinematic", 78, 0, [
    "ambient",
    "cinematic",
    "drone",
    "soundscape",
    "film",
  ]),
  band("experimental", "Experimental electronic", 138, 0.04, [
    "experimental",
    "idm",
    "glitch",
    "electro",
    "electronic",
  ]),
];

export function getTempoAgentBands(input: TempoAgentRequest): TempoBand[] {
  const parsed = TempoAgentRequestSchema.parse(input);
  const tokens = tokenize(parsed.prompt);
  const scored = tempoBands
    .map((candidate) => ({ candidate, score: scoreTempoBand(candidate, tokens) }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.candidate.label.localeCompare(right.candidate.label),
    )
    .map(({ candidate }) => candidate);

  if (scored.length > 0) {
    const scoredIds = new Set(scored.map((candidate) => candidate.id));
    return [
      ...scored,
      ...tempoBands.filter((candidate) => !scoredIds.has(candidate.id)).slice(0, 3),
    ];
  }

  return [
    {
      id: "current-context",
      label: "Current global context",
      bpm: parsed.context?.bpm ?? 138,
      swing: parsed.context?.swing ?? 0,
      tags: ["current", "manual"],
      rationale: "No genre match was obvious, so this keeps the current global tempo feel.",
    },
    ...tempoBands.slice(0, 3),
  ];
}

export function buildTempoAgentPrompt(input: TempoAgentRequest, candidates: TempoBand[]) {
  return [
    `Genre prompt: ${input.prompt}`,
    input.context
      ? `Current global context: ${input.context.bpm} BPM, swing ${input.context.swing}`
      : null,
    "",
    "Return one BPM and swing suggestion for the global DAW context.",
    "Swing is a decimal fraction, so 0.08 means 8% swing and 0 means straight timing.",
    "Pick values that are practical for sequencing, not only historically exact.",
    "",
    "Useful reference bands:",
    ...candidates.map((candidate) =>
      [
        `${candidate.label}`,
        `default BPM ${candidate.bpm}`,
        `default swing ${candidate.swing}`,
        `tags ${candidate.tags.join(", ")}`,
      ].join(" | "),
    ),
    "",
    "The final BPM must be between 1 and 260. The final swing must be between 0 and 0.5.",
    "Alternatives should be meaningfully different tempo feels, not tiny numeric tweaks.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function createDeterministicTempoChoice(input: TempoAgentRequest): TempoAgentOutput {
  const parsed = TempoAgentRequestSchema.parse(input);
  const candidates = getTempoAgentBands(parsed);
  const selected = candidates[0] ?? tempoBands[0];

  return TempoAgentOutputSchema.parse({
    selected: {
      bpm: selected.bpm,
      swing: selected.swing,
      rationale: `${selected.label} matched "${parsed.prompt}", so ${selected.bpm} BPM with ${Math.round(
        selected.swing * 100,
      )}% swing is a useful starting feel.`,
    },
    alternatives: candidates.slice(1, 4).map((candidate) => ({
      bpm: candidate.bpm,
      swing: candidate.swing,
      rationale: `${candidate.label}: ${candidate.rationale}`,
    })),
    querySummary: `Tempo search over ${candidates.length} genre-informed groove bands.`,
  });
}

function band(
  id: string,
  label: string,
  bpm: number,
  swing: number,
  tags: string[],
): TempoBand {
  return {
    id,
    label,
    bpm,
    swing,
    tags,
    rationale: `${label} commonly works around ${bpm} BPM with ${Math.round(
      swing * 100,
    )}% swing.`,
  };
}

function scoreTempoBand(candidate: TempoBand, tokens: string[]) {
  return tokens.reduce((score, token) => {
    if (candidate.id.includes(token)) {
      return score + 8;
    }

    if (candidate.tags.some((tag) => tag === token)) {
      return score + 6;
    }

    if (candidate.label.toLowerCase().includes(token)) {
      return score + 4;
    }

    return score;
  }, 0);
}

function tokenize(prompt: string) {
  return prompt
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}
