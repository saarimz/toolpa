import { z } from "zod";

import {
  GlobalBpmSchema,
  GlobalSwingSchema,
  TonicSchema,
} from "@/lib/music/context";

export const MidiClipSchemaVersion = 1;

export const MidiClipBarsSchema = z.union([
  z.literal(2),
  z.literal(4),
  z.literal(8),
  z.literal(16),
  z.literal(32),
  z.literal(64),
  z.literal(128),
  z.literal(256),
  z.literal(512),
  z.literal(1024),
]);

export const MidiClipBeatsPerBarSchema = z.union([
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);

export const MidiClipStepsPerBarSchema = z.union([
  z.literal(4),
  z.literal(8),
  z.literal(16),
]);

export const MidiClipTrackRoleSchema = z.enum([
  "bass",
  "chord",
  "lead",
  "arp",
  "pad",
  "drum",
]);

export const MidiClipGenerationModeSchema = z.enum([
  "auto",
  "full",
  "melody",
  "harmony",
  "bassline",
  "arpeggio",
  "rhythm",
  "pad",
]);

export const MidiClipStyleProfileSchema = z.enum([
  "auto",
  "neutral",
  "lyrical-sparse",
  "minimal-cyclic",
  "spacious-pointillist",
  "organic-hybrid",
  "groove-forward",
  "broken-beat",
  "ambient-sustained",
  "percussive-grid",
]);

export const MidiClipNoteSchema = z.object({
  id: z.string().min(1),
  trackId: z.string().min(1),
  midi: z.number().int().min(0).max(127),
  startBeat: z.number().min(0),
  durationBeats: z.number().positive(),
  velocity: z.number().min(0).max(1).default(0.8),
  channel: z.number().int().min(0).max(15).default(0),
  pitchBendCents: z.number().min(-200).max(200).default(0),
  cc: z
    .array(
      z.object({
        beatOffset: z.number().min(0).default(0),
        controller: z.number().int().min(0).max(127),
        value: z.number().min(0).max(127),
      }),
    )
    .default([]),
});

export const MidiClipTrackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: MidiClipTrackRoleSchema,
  channel: z.number().int().min(0).max(15),
  mute: z.boolean().default(false),
});

export const MidiClipMetadataSchema = z
  .object({
    createdBy: z.enum(["manual", "local-agent"]).default("local-agent"),
    prompt: z.string().default(""),
    editPrompt: z.string().default(""),
    generationMode: MidiClipGenerationModeSchema.default("full"),
    styleProfile: MidiClipStyleProfileSchema.default("neutral"),
    rationale: z.string().default(""),
    history: z.array(z.string()).default([]),
  })
  .default({
    createdBy: "local-agent",
    prompt: "",
    editPrompt: "",
    generationMode: "full",
    styleProfile: "neutral",
    rationale: "",
    history: [],
  });

export const MidiClipSchema = z.object({
  schemaVersion: z.literal(MidiClipSchemaVersion).default(MidiClipSchemaVersion),
  id: z.string().min(1),
  name: z.string().min(1),
  bpm: GlobalBpmSchema,
  swing: GlobalSwingSchema.default(0),
  key: TonicSchema.default("C"),
  scaleId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).default("minor"),
  bars: MidiClipBarsSchema,
  beatsPerBar: MidiClipBeatsPerBarSchema.default(4),
  stepsPerBar: MidiClipStepsPerBarSchema.default(16),
  seed: z.number().int().min(0).max(999999),
  tracks: z.array(MidiClipTrackSchema).min(1).max(8),
  notes: z.array(MidiClipNoteSchema).min(1).max(4096),
  metadata: MidiClipMetadataSchema,
});

export type MidiClipBars = z.infer<typeof MidiClipBarsSchema>;
export type MidiClipBeatsPerBar = z.infer<typeof MidiClipBeatsPerBarSchema>;
export type MidiClipGenerationMode = z.infer<typeof MidiClipGenerationModeSchema>;
export type MidiClipNote = z.infer<typeof MidiClipNoteSchema>;
export type MidiClipStepsPerBar = z.infer<typeof MidiClipStepsPerBarSchema>;
export type MidiClipStyleProfile = z.infer<typeof MidiClipStyleProfileSchema>;
export type MidiClipTrack = z.infer<typeof MidiClipTrackSchema>;
export type MidiClipTrackRole = z.infer<typeof MidiClipTrackRoleSchema>;
export type MidiClip = z.infer<typeof MidiClipSchema>;

export const MIDI_CLIP_BAR_OPTIONS: MidiClipBars[] = [
  2,
  4,
  8,
  16,
  32,
  64,
  128,
  256,
  512,
  1024,
];

export const MIDI_CLIP_GENERATION_MODE_OPTIONS: Array<{
  label: string;
  value: MidiClipGenerationMode;
}> = [
  { label: "auto", value: "auto" },
  { label: "full", value: "full" },
  { label: "melody", value: "melody" },
  { label: "harmony", value: "harmony" },
  { label: "bassline", value: "bassline" },
  { label: "arpeggio", value: "arpeggio" },
  { label: "rhythm", value: "rhythm" },
  { label: "pad", value: "pad" },
];

export const MIDI_CLIP_STYLE_PROFILE_OPTIONS: Array<{
  label: string;
  value: MidiClipStyleProfile;
}> = [
  { label: "auto", value: "auto" },
  { label: "neutral", value: "neutral" },
  { label: "lyrical sparse", value: "lyrical-sparse" },
  { label: "minimal cyclic", value: "minimal-cyclic" },
  { label: "spacious pointillist", value: "spacious-pointillist" },
  { label: "organic hybrid", value: "organic-hybrid" },
  { label: "groove forward", value: "groove-forward" },
  { label: "broken beat", value: "broken-beat" },
  { label: "ambient sustained", value: "ambient-sustained" },
  { label: "percussive grid", value: "percussive-grid" },
];

export const MIDI_CLIP_STEP_OPTIONS: MidiClipStepsPerBar[] = [4, 8, 16];

export function getMidiClipTotalBeats(
  clip: Pick<MidiClip, "bars"> & Partial<Pick<MidiClip, "beatsPerBar">>,
) {
  return clip.bars * (clip.beatsPerBar ?? 4);
}
