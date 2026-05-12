import { z } from "zod";

import {
  getScaleDefinition,
  getScaleSemitoneApproximation,
} from "@/lib/music/scale-catalog";

export const SynthSceneSchemaVersion = 1;

export const ScaleSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/).default("minor");

export const SynthVoiceRoleSchema = z.enum([
  "bass",
  "chord",
  "stab",
  "lead",
  "texture",
]);

export const ModulationWaveSchema = z.enum([
  "sine",
  "triangle",
  "square",
  "sawtooth",
]);

export const RootWaveformSchema = z.enum([
  "sine",
  "wavetable",
  "square",
  "sawtooth",
]);

export const EvolutionBarsSchema = z.union([
  z.literal(4),
  z.literal(8),
  z.literal(16),
  z.literal(32),
  z.literal(64),
  z.literal(128),
]);

export const SynthStepSchema = z.object({
  step: z.number().int().min(0).max(511),
  active: z.boolean().default(false),
  midi: z.number().int().min(12).max(108),
  tuningCents: z.number().min(-100).max(100).default(0),
  velocity: z.number().min(0).max(1).default(0.75),
  probability: z.number().min(0).max(1).default(1),
  lengthSteps: z.number().int().min(1).max(512).default(1),
  microShift: z.number().min(-0.5).max(0.5).default(0),
  modulationShift: z.number().min(-1).max(1).default(0),
  partialMorph: z.number().min(0).max(1).default(0),
});

export const VoicePatchSchema = z.object({
  partials: z.array(z.number().min(0).max(1)).min(4).max(16),
  rootWaveform: RootWaveformSchema.default("wavetable"),
  modulationIndex: z.number().min(0).max(48),
  harmonicity: z.number().min(0.125).max(8),
  modulationType: ModulationWaveSchema.default("sine"),
  detuneCents: z.number().min(-48).max(48).default(0),
  attack: z.number().min(0.001).max(2),
  decay: z.number().min(0.01).max(3),
  sustain: z.number().min(0).max(1),
  release: z.number().min(0.01).max(8),
  modulationAttack: z.number().min(0.001).max(2),
  modulationRelease: z.number().min(0.01).max(8),
});

export const SynthVoiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  role: SynthVoiceRoleSchema,
  gainDb: z.number().min(-36).max(6).default(-10),
  pan: z.number().min(-1).max(1).default(0),
  mute: z.boolean().default(false),
  patch: VoicePatchSchema,
  steps: z.array(SynthStepSchema).min(1).max(512),
});

export const SynthEffectsSchema = z.object({
  filter: z.object({
    cutoffHz: z.number().min(80).max(12000),
    resonance: z.number().min(0.1).max(18),
    motion: z.number().min(0).max(1),
  }),
  delay: z.object({
    time: z.enum(["16n", "8n", "8n.", "4n"]),
    feedback: z.number().min(0).max(0.92),
    wet: z.number().min(0).max(0.9),
  }),
  reverb: z.object({
    decay: z.number().min(0.2).max(12),
    preDelay: z.number().min(0).max(0.35),
    wet: z.number().min(0).max(0.9),
  }),
  chorus: z.object({
    rateHz: z.number().min(0.02).max(8),
    depth: z.number().min(0).max(1),
    wet: z.number().min(0).max(0.8),
  }),
  drive: z.object({
    amount: z.number().min(0).max(0.9),
    wet: z.number().min(0).max(0.7),
  }),
  masterDb: z.number().min(-24).max(0).default(-8),
});

export const SynthMacroSchema = z.object({
  evolution: z.number().min(0).max(1),
  mutationDepth: z.number().min(0).max(1),
  brightness: z.number().min(0).max(1),
  dubSpace: z.number().min(0).max(1),
  density: z.number().min(0).max(1),
  analogDrift: z.number().min(0).max(1),
});

export const SynthSceneMetadataSchema = z
  .object({
    createdBy: z.enum(["manual", "ai", "local-agent"]).default("local-agent"),
    prompt: z.string().default(""),
    rationale: z.string().default(""),
    influences: z.array(z.string()).default([]),
    agentPlan: z.array(z.string()).default([]),
    researchBasis: z.array(z.string()).default([]),
  })
  .default({
    createdBy: "local-agent",
    prompt: "",
    rationale: "",
    influences: [],
    agentPlan: [],
    researchBasis: [],
  });

export const SynthSceneSchema = z.object({
  schemaVersion: z.literal(SynthSceneSchemaVersion).default(SynthSceneSchemaVersion),
  id: z.string().min(1),
  name: z.string().min(1),
  bpm: z.number().min(40).max(260),
  swing: z.number().min(0).max(0.5).default(0),
  key: z.string().min(1).max(3),
  scale: ScaleSchema,
  bars: EvolutionBarsSchema,
  stepsPerBar: z.union([z.literal(4), z.literal(8), z.literal(16), z.literal(32)]),
  seed: z.number().int().min(0).max(999999),
  macros: SynthMacroSchema,
  effects: SynthEffectsSchema,
  voices: z.array(SynthVoiceSchema).min(1).max(6),
  metadata: SynthSceneMetadataSchema,
});

export type SynthScale = z.infer<typeof ScaleSchema>;
export type EvolutionBars = z.infer<typeof EvolutionBarsSchema>;
export type SynthRootWaveform = z.infer<typeof RootWaveformSchema>;
export type SynthStep = z.infer<typeof SynthStepSchema>;
export type VoicePatch = z.infer<typeof VoicePatchSchema>;
export type SynthVoice = z.infer<typeof SynthVoiceSchema>;
export type SynthEffects = z.infer<typeof SynthEffectsSchema>;
export type SynthMacros = z.infer<typeof SynthMacroSchema>;
export type SynthScene = z.infer<typeof SynthSceneSchema>;

const noteIndexes: Record<string, number> = {
  C: 0,
  "C#": 1,
  DB: 1,
  D: 2,
  "D#": 3,
  EB: 3,
  E: 4,
  F: 5,
  "F#": 6,
  GB: 6,
  G: 7,
  "G#": 8,
  AB: 8,
  A: 9,
  "A#": 10,
  BB: 10,
  B: 11,
};

const noteNames = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export function getScaleSemitones(scale: SynthScale): number[] {
  return getScaleSemitoneApproximation(scale);
}

export function getScaleDisplayName(scale: SynthScale): string {
  return getScaleDefinition(scale)?.name ?? scale;
}

export function normalizeKey(input: string): string {
  const match = input.trim().match(/^([A-Ga-g])([#bB]?)/);
  if (!match) {
    return "C";
  }

  const root = match[1].toUpperCase();
  const accidental = match[2]?.toLowerCase() === "b" ? "b" : match[2] === "#" ? "#" : "";
  return `${root}${accidental}`;
}

export function keyToMidiRoot(key: string, octave = 2): number {
  const normalized = normalizeKey(key).toUpperCase();
  const index = noteIndexes[normalized] ?? 0;
  return clampInt(12 + octave * 12 + index, 12, 108);
}

export function midiToNoteName(midi: number): string {
  const clamped = clampInt(midi, 0, 127);
  const octave = Math.floor(clamped / 12) - 1;
  return `${noteNames[clamped % 12]}${octave}`;
}

export function midiToFrequency(midi: number, tuningCents = 0, a4 = 440): number {
  return a4 * 2 ** ((midi - 69 + tuningCents / 100) / 12);
}

export function noteNameToMidi(noteName: string): number | null {
  const match = noteName.trim().match(/^([A-Ga-g])([#bB]?)(-?\d)$/);
  if (!match) {
    return null;
  }

  const key = `${match[1].toUpperCase()}${match[2]?.toUpperCase() ?? ""}`;
  const noteIndex = noteIndexes[key];
  const octave = Number(match[3]);
  if (noteIndex === undefined || !Number.isFinite(octave)) {
    return null;
  }

  return clampInt((octave + 1) * 12 + noteIndex, 12, 108);
}

export function getStepsPerBarForEvolutionBars(bars: EvolutionBars) {
  if (bars >= 128) {
    return 4;
  }

  if (bars >= 64) {
    return 8;
  }

  return 16;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampInt(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}
