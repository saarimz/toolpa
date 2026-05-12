import { z } from "zod";

import { SampleRoleSchema } from "@/lib/samples/roles";

export const SAMPLE_ANALYSIS_SCHEMA_VERSION = 2 as const;

export const StatsSchema = z.object({
  mean: z.number(),
  std: z.number(),
  min: z.number(),
  max: z.number(),
});

export type Stats = z.infer<typeof StatsSchema>;

export const SliceFeaturesSchema = z.object({
  start_s: z.number().min(0),
  end_s: z.number().min(0),
  rms_dbfs: z.number(),
  peak_dbfs: z.number(),
  centroid_hz: z.number().min(0),
  rolloff85_hz: z.number().min(0),
  flatness: z.number().min(0).max(1),
  zcr: z.number().min(0),
  fundamental_hz: z.number().nullable(),
  mfcc: z.array(z.number()).length(13),
  attack_ms: z.number().nullable(),
  decay_t60_ms: z.number().nullable(),
});

export type SliceFeatures = z.infer<typeof SliceFeaturesSchema>;

export const LlmDescriptorsSchema = z.object({
  timbre: z.array(z.string()),
  mood: z.array(z.string()),
  use_case: z.array(z.string()),
  suggested_genres: z.array(z.string()),
});

export type LlmDescriptors = z.infer<typeof LlmDescriptorsSchema>;

export const TagScoreSchema = z.object({
  label: z.string().min(1),
  score: z.number().min(0).max(1),
});

export type TagScore = z.infer<typeof TagScoreSchema>;

export const ModelTagsSchema = z.object({
  musicnn: z.array(TagScoreSchema).default([]),
  voice_present_prob: z.number().min(0).max(1).default(0),
  model_id: z.string().min(1).optional(),
});

export type ModelTags = z.infer<typeof ModelTagsSchema>;

export const SampleAnalysisSchema = z.object({
  schema_version: z.literal(SAMPLE_ANALYSIS_SCHEMA_VERSION),
  source: z.object({
    sample_rate: z.number().int().positive(),
    channels: z.number().int().min(1).max(8),
    duration_s: z.number().min(0),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  global: z.object({
    lufs_integrated: z.number(),
    true_peak_dbfs: z.number(),
    rms_dbfs: z.number(),
    crest_factor_db: z.number(),
    stereo_width: z.number().min(0).max(1),
    is_silent: z.boolean(),
    dc_offset: z.number(),
  }),
  spectral: z.object({
    centroid_hz: StatsSchema,
    rolloff85_hz: StatsSchema,
    flatness: StatsSchema,
    flux: StatsSchema,
    mfcc_mean: z.array(z.number()).length(13),
    mfcc_std: z.array(z.number()).length(13),
  }),
  tonal: z.object({
    chroma_mean: z.array(z.number()).length(12),
    key: z.string().nullable(),
    scale: z.enum(["major", "minor"]).nullable(),
    key_strength: z.number().min(0).max(1),
    tuning_hz: z.number().default(440),
  }),
  rhythm: z.object({
    bpm: z.number().nullable(),
    bpm_confidence: z.number().min(0).max(1),
    beat_offset_s: z.number().nullable(),
    onsets_s: z.array(z.number()),
    onset_rate_hz: z.number().min(0),
    swing_ratio: z.number().nullable(),
  }),
  envelope: z
    .object({
      attack_ms: z.number().nullable(),
      decay_t60_ms: z.number().nullable(),
      peak_position_frac: z.number().min(0).max(1),
    })
    .nullable(),
  slices: z.array(SliceFeaturesSchema).default([]),
  beats: z.array(SliceFeaturesSchema).default([]),
  role: SampleRoleSchema.nullable(),
  role_confidence: z.number().min(0).max(1),
  tags: ModelTagsSchema.nullable().default(null),
  llm_descriptors: LlmDescriptorsSchema.nullable(),
  pipeline_version: z.string().min(1),
  analyzed_at: z.number().int().nonnegative(),
});

export type SampleAnalysis = z.infer<typeof SampleAnalysisSchema>;

export const ANALYSIS_PATHS = [
  "global.lufs_integrated",
  "global.rms_dbfs",
  "global.true_peak_dbfs",
  "global.stereo_width",
  "spectral.centroid_hz",
  "spectral.rolloff85_hz",
  "spectral.flatness",
  "spectral.mfcc_mean",
  "tonal.chroma_mean",
  "tonal.key",
  "tonal.key_strength",
  "rhythm.bpm",
  "rhythm.bpm_confidence",
  "rhythm.onsets_s",
  "rhythm.onset_rate_hz",
  "rhythm.swing_ratio",
  "envelope.attack_ms",
  "envelope.decay_t60_ms",
  "slices",
  "beats",
  "role",
  "tags.musicnn",
  "tags.voice_present_prob",
  "llm_descriptors",
] as const;

export const AnalysisPathSchema = z.enum(ANALYSIS_PATHS);
export type AnalysisPath = z.infer<typeof AnalysisPathSchema>;

export function pickAnalysisFields(
  analysis: SampleAnalysis,
  paths: readonly AnalysisPath[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const path of paths) {
    const value = readPath(analysis as unknown as Record<string, unknown>, path);
    if (value !== undefined) {
      result[path] = value;
    }
  }
  return result;
}

function readPath(
  source: Record<string, unknown>,
  path: string,
): unknown {
  const segments = path.split(".");
  let current: unknown = source;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
