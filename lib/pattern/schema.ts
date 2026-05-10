import { z } from "zod";

import { SampleRoleSchema } from "@/lib/samples/roles";

export const PatternSchemaVersion = 1;

export const StepConditionSchema = z.object({
  type: z.enum(["everyN", "firstOfN", "notFirstOfN"]),
  n: z.number().int().min(1).max(64),
});

export const StepTuningRefSchema = z.object({
  scaleId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  degree: z.number().int().min(-128).max(128),
});

export const StepSchema = z.object({
  id: z.string().optional(),
  active: z.boolean().default(false),
  velocity: z.number().min(0).max(1).default(1),
  microShift: z.number().min(-0.5).max(0.5).default(0),
  probability: z.number().min(0).max(1).default(1),
  conditions: z.array(StepConditionSchema).default([]),
  sampleId: z.string().min(1).optional(),
  slot: z.number().int().min(0).optional(),
  pitchSemitones: z.number().min(-48).max(48).default(0),
  pitchCents: z.number().min(-4800).max(4800).optional(),
  tuningRef: StepTuningRefSchema.optional(),
  playbackRate: z.number().min(0.03125).max(8).optional(),
  decay: z.number().min(0).max(1).optional(),
  reverse: z.boolean().default(false),
  chokeGroup: z.string().min(1).optional(),
  repeats: z.number().int().min(1).max(8).default(1),
});

export const TrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sampleId: z.string().min(1),
  role: z.union([SampleRoleSchema, z.literal("unknown")]).default("unknown"),
  slot: z.number().int().min(0).optional(),
  chokeGroup: z.string().min(1).optional(),
  steps: z.array(StepSchema).min(1).max(512),
  stepCount: z.number().int().min(1).max(512).optional(),
  mute: z.boolean().default(false),
  solo: z.boolean().default(false),
  gain: z.number().min(0).max(2).default(1),
  pan: z.number().min(-1).max(1).default(0),
});

export const PatternMetadataSchema = z
  .object({
    toolSlug: z.string().optional(),
    sourceSampleId: z.string().optional(),
    sourceSampleName: z.string().optional(),
    sourceSampleIds: z.array(z.string().min(1)).optional(),
    sourceSampleNames: z.array(z.string().min(1)).optional(),
    createdBy: z.enum(["manual", "ai", "import"]).optional(),
    rationale: z.string().optional(),
    tags: z.array(z.string()).default([]),
  })
  .default({ tags: [] });

export const PatternSchema = z.object({
  schemaVersion: z.literal(PatternSchemaVersion).default(PatternSchemaVersion),
  id: z.string().min(1),
  name: z.string().min(1),
  bpm: z.number().min(40).max(260).default(160),
  swing: z.number().min(0).max(0.5).default(0),
  bars: z.number().int().min(1).max(16),
  stepsPerBar: z.number().int().min(1).max(64),
  tracks: z.array(TrackSchema).min(1).max(64),
  metadata: PatternMetadataSchema,
});

export type StepCondition = z.infer<typeof StepConditionSchema>;
export type StepTuningRef = z.infer<typeof StepTuningRefSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Pattern = z.infer<typeof PatternSchema>;

export function createStep(overrides: Partial<Step> = {}): Step {
  return StepSchema.parse(overrides);
}

export function createTrack(overrides: {
  id: string;
  name: string;
  sampleId: string;
  steps?: Partial<Step>[];
  role?: Track["role"];
  slot?: number;
  chokeGroup?: string;
}): Track {
  const steps =
    overrides.steps && overrides.steps.length > 0
      ? overrides.steps.map((step) => createStep(step))
      : Array.from({ length: 16 }, () => createStep());

  return TrackSchema.parse({
    ...overrides,
    steps,
    stepCount: steps.length,
  });
}

export function createPattern(overrides: {
  id?: string;
  name?: string;
  bpm?: number;
  swing?: number;
  bars?: number;
  stepsPerBar?: number;
  tracks: Track[];
  metadata?: Partial<Pattern["metadata"]>;
}): Pattern {
  return PatternSchema.parse({
    schemaVersion: PatternSchemaVersion,
    id: overrides.id ?? "pattern-default",
    name: overrides.name ?? "untitled pattern",
    bpm: overrides.bpm ?? 160,
    swing: overrides.swing ?? 0,
    bars: overrides.bars ?? 1,
    stepsPerBar: overrides.stepsPerBar ?? 16,
    tracks: overrides.tracks,
    metadata: overrides.metadata ?? {},
  });
}

export function stepConditionsHold(
  conditions: StepCondition[],
  barIndex: number,
): boolean {
  return conditions.every((condition) => {
    if (condition.type === "everyN") {
      return (barIndex + 1) % condition.n === 0;
    }

    if (condition.type === "firstOfN") {
      return barIndex % condition.n === 0;
    }

    return barIndex % condition.n !== 0;
  });
}

export function getPatternStepCount(pattern: Pick<Pattern, "bars" | "stepsPerBar">) {
  return pattern.bars * pattern.stepsPerBar;
}
