import { z } from "zod";

export const TIME_STRETCH_SCHEMA_VERSION = 1;

export const TimeStretchModeSchema = z.enum([
  "transparent",
  "rhythmic",
  "tonal",
  "ambient-cloud",
  "spectral-freeze",
  "subharmonic-bloom",
  "granular-smear",
]);

export const TimeStretchTransientModeSchema = z.enum([
  "preserve",
  "soften",
  "ignore",
  "ghost",
]);

export const TimeStretchPhaseModeSchema = z.enum([
  "locked",
  "laminar",
  "independent",
  "randomized",
]);

export const TimeStretchPerformanceModeSchema = z.enum([
  "none",
  "disintegration-loop",
  "low-end-tide",
  "spectral-erosion",
  "cloud-orbit",
  "memory-decay",
  "broken-tape",
]);

export const TimeStretchPatchSchema = z.object({
  schemaVersion: z.literal(TIME_STRETCH_SCHEMA_VERSION).default(TIME_STRETCH_SCHEMA_VERSION),
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  bpm: z.number().min(40).max(260),
  targetBars: z.number().min(0.25).max(256),
  mode: TimeStretchModeSchema,
  windowMs: z.number().min(20).max(2000),
  transientMode: TimeStretchTransientModeSchema,
  phaseMode: TimeStretchPhaseModeSchema,
  spectralBlur: z.number().min(0).max(1),
  texture: z.number().min(0).max(1),
  pitchSemitones: z.number().min(-24).max(24),
  octaveDownMix: z.number().min(0).max(1),
  subharmonicMix: z.number().min(0).max(1),
  stereoWidth: z.number().min(0).max(2),
  freezePosition: z.number().min(0).max(1),
  performanceMode: TimeStretchPerformanceModeSchema,
  movementDepth: z.number().min(0).max(1),
  degradation: z.number().min(0).max(1),
  wowFlutter: z.number().min(0).max(1),
  dropoutAmount: z.number().min(0).max(1),
  noiseAmount: z.number().min(0).max(1),
  filterDrift: z.number().min(0).max(1),
  subMotion: z.number().min(0).max(1),
  seed: z.number().int().min(1).max(2147483646),
});

export type TimeStretchMode = z.infer<typeof TimeStretchModeSchema>;
export type TimeStretchPatch = z.infer<typeof TimeStretchPatchSchema>;
export type TimeStretchTransientMode = z.infer<typeof TimeStretchTransientModeSchema>;
export type TimeStretchPhaseMode = z.infer<typeof TimeStretchPhaseModeSchema>;
export type TimeStretchPerformanceMode = z.infer<typeof TimeStretchPerformanceModeSchema>;

export const DEFAULT_TIME_STRETCH_PATCH: TimeStretchPatch = TimeStretchPatchSchema.parse({
  sourceId: "library:element-one/synth-pad-swell-01",
  sourceName: "Synth Pad Swell 01",
  bpm: 120,
  targetBars: 16,
  mode: "ambient-cloud",
  windowMs: 420,
  transientMode: "soften",
  phaseMode: "randomized",
  spectralBlur: 0.72,
  texture: 0.62,
  pitchSemitones: 0,
  octaveDownMix: 0.24,
  subharmonicMix: 0.18,
  stereoWidth: 1.2,
  freezePosition: 0.45,
  performanceMode: "none",
  movementDepth: 0,
  degradation: 0,
  wowFlutter: 0,
  dropoutAmount: 0,
  noiseAmount: 0,
  filterDrift: 0,
  subMotion: 0,
  seed: 7331,
});

export function getTargetDurationSec({
  bpm,
  targetBars,
}: Pick<TimeStretchPatch, "bpm" | "targetBars">) {
  return (60 / bpm) * 4 * targetBars;
}

export function getStretchRatio({
  sourceDurationSec,
  targetDurationSec,
}: {
  sourceDurationSec: number;
  targetDurationSec: number;
}) {
  return targetDurationSec / Math.max(0.001, sourceDurationSec);
}

export function sanitizeTimeStretchPatch(
  patch: Partial<TimeStretchPatch> & Pick<TimeStretchPatch, "sourceId" | "sourceName">,
): TimeStretchPatch {
  return TimeStretchPatchSchema.parse({
    ...DEFAULT_TIME_STRETCH_PATCH,
    ...patch,
    schemaVersion: TIME_STRETCH_SCHEMA_VERSION,
  });
}
