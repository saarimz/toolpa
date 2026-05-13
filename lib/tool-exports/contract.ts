import { z } from "zod";

export const ExportStrategySchema = z.enum([
  "offline-render",
  "standard-midi-file",
  "live-recording",
  "source-audio",
  "unsupported",
]);

export const AudioExportDeclarationSchema = z.object({
  strategy: z.enum(["offline-render", "live-recording", "source-audio"]),
  formats: z.tuple([z.literal("wav")]).default(["wav"]),
  maxDefaultDurationSec: z.number().positive().max(60 * 60).default(240),
  requiresUserGestureForPreview: z.boolean().default(true),
});

export const MidiExportDeclarationSchema = z.object({
  strategy: z.literal("standard-midi-file"),
  format: z.enum(["smf-0", "smf-1"]).default("smf-1"),
  ticksPerQuarter: z.union([z.literal(480), z.literal(960)]).default(480),
  preservesTracks: z.boolean().default(true),
  supportsPitchBend: z.boolean().default(true),
  supportsCc: z.boolean().default(true),
});

export const ExportableDocumentSchema = z.enum([
  "pattern",
  "synth-scene",
  "midi-clip",
  "audio-stream",
]);

export const ToolExportDeclarationSchema = z.object({
  document: ExportableDocumentSchema,
  audio: AudioExportDeclarationSchema.optional(),
  midi: MidiExportDeclarationSchema.optional(),
});

export type ExportStrategy = z.infer<typeof ExportStrategySchema>;
export type AudioExportDeclaration = z.infer<typeof AudioExportDeclarationSchema>;
export type MidiExportDeclaration = z.infer<typeof MidiExportDeclarationSchema>;
export type ToolExportDeclaration = z.infer<typeof ToolExportDeclarationSchema>;
