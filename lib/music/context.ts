import { z } from "zod";

export const MIN_BPM = 1;
export const MAX_BPM = 260;

export const GlobalBpmSchema = z.number().min(MIN_BPM).max(MAX_BPM);
export const GlobalSwingSchema = z.number().min(0).max(0.5);

export const TonicSchema = z.enum([
  "C",
  "C#",
  "Db",
  "D",
  "D#",
  "Eb",
  "E",
  "F",
  "F#",
  "Gb",
  "G",
  "G#",
  "Ab",
  "A",
  "A#",
  "Bb",
  "B",
]);

export const ChromaticTonics = [
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

export const ScaleTuningSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("12tet"),
    intervals: z.array(z.number().int().min(0).max(36)).min(1).max(36),
    periodCents: z.number().positive().default(1200),
  }),
  z.object({
    kind: z.literal("edo"),
    divisions: z.number().int().min(5).max(72),
    steps: z.array(z.number().int().min(0).max(72)).min(1).max(72),
    periodCents: z.number().positive().default(1200),
  }),
  z.object({
    kind: z.literal("cents"),
    cents: z.array(z.number().min(0).max(5000)).min(1).max(128),
    periodCents: z.number().positive().default(1200),
  }),
  z.object({
    kind: z.literal("ratios"),
    ratios: z
      .array(z.string().regex(/^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/))
      .min(1)
      .max(128),
    periodRatio: z.string().regex(/^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/).default("2/1"),
  }),
]);

export const ScaleDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  family: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  description: z.string().min(1),
  microtonal: z.boolean().default(false),
  tuning: ScaleTuningSchema,
  source: z
    .enum(["curated", "scala-compatible", "tool-generated", "tonal-compatible"])
    .default("curated"),
  sourceUrl: z.string().url().optional(),
});

export const GlobalKeySchema = z.object({
  tonic: TonicSchema.default("C"),
  scaleId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).default("minor"),
  referenceFrequency: z.number().min(400).max(480).default(440),
});

export const GlobalMusicContextSchema = z.object({
  bpm: GlobalBpmSchema.default(138),
  swing: GlobalSwingSchema.default(0),
  key: GlobalKeySchema.default({
    tonic: "C",
    scaleId: "minor",
    referenceFrequency: 440,
  }),
});

export const InstrumentMusicContextSchema = z
  .object({
    globalBpm: z.boolean().default(false),
    globalKey: z.boolean().default(false),
    scaleSearch: z.boolean().default(false),
  })
  .default({
    globalBpm: false,
    globalKey: false,
    scaleSearch: false,
  });

export type Tonic = z.infer<typeof TonicSchema>;
export type ScaleTuning = z.infer<typeof ScaleTuningSchema>;
export type ScaleDefinition = z.infer<typeof ScaleDefinitionSchema>;
export type GlobalKey = z.infer<typeof GlobalKeySchema>;
export type GlobalMusicContext = z.infer<typeof GlobalMusicContextSchema>;
export type InstrumentMusicContext = z.infer<typeof InstrumentMusicContextSchema>;

export const DEFAULT_GLOBAL_MUSIC_CONTEXT: GlobalMusicContext =
  GlobalMusicContextSchema.parse({});

export function formatGlobalMusicContext(context: GlobalMusicContext) {
  return `${context.key.tonic} ${context.key.scaleId} / ${context.bpm} BPM`;
}
