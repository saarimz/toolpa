import { z } from "zod";

export const VisualizerModeSchema = z.enum([
  "spectrogram",
  "frequency-bars",
  "radial-bloom",
  "particle-field",
  "waveform-ribbon",
  "tunnel",
]);

export const VisualizerPaletteSchema = z.enum([
  "mono",
  "neon",
  "ember",
  "ultraviolet",
  "sea-glass",
  "prism",
]);

export const VisualizerAudioSourceSchema = z.enum([
  "live-audio",
  "audio-file",
  "microphone",
]);

export const VisualizerFeatureSchema = z.enum([
  "rms",
  "peak",
  "bass",
  "lowMid",
  "mid",
  "highMid",
  "air",
  "centroid",
  "flux",
  "onset",
  "beat",
]);

export const VisualizerAutomationTargetSchema = z.enum([
  "brightness",
  "feedback",
  "grain",
  "hueShift",
  "lineWeight",
  "particleCount",
  "rotation",
  "zoom",
]);

export const VisualizerAnalyzerSchema = z.object({
  fftSize: z.union([
    z.literal(512),
    z.literal(1024),
    z.literal(2048),
    z.literal(4096),
    z.literal(8192),
    z.literal(16384),
  ]).default(8192),
  maxDecibels: z.number().min(-60).max(0).default(-18),
  minDecibels: z.number().min(-120).max(-20).default(-92),
  smoothingTimeConstant: z.number().min(0).max(0.98).default(0.78),
});

export const VisualizerAutomationSchema = z.object({
  target: VisualizerAutomationTargetSchema,
  feature: VisualizerFeatureSchema,
  depth: z.number().min(0).max(1),
  smoothing: z.number().min(0).max(0.98).default(0.35),
  invert: z.boolean().default(false),
});

export const VisualizerSceneSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  id: z.string().min(1).default("audio-reactive-visual-scene"),
  name: z.string().min(1).default("Audio Reactive Visualizer"),
  prompt: z.string().default(""),
  source: VisualizerAudioSourceSchema.default("live-audio"),
  mode: VisualizerModeSchema.default("spectrogram"),
  palette: VisualizerPaletteSchema.default("neon"),
  analyzer: VisualizerAnalyzerSchema.prefault({}),
  mapping: z.object({
    primaryFeature: VisualizerFeatureSchema.default("rms"),
    secondaryFeature: VisualizerFeatureSchema.default("centroid"),
    accentFeature: VisualizerFeatureSchema.default("onset"),
    sensitivity: z.number().min(0.1).max(4).default(1.35),
    reactivity: z.number().min(0).max(1).default(0.82),
    dynamicRangeDb: z.number().min(12).max(96).default(54),
    beatHoldMs: z.number().min(40).max(800).default(180),
  }).prefault({}),
  motion: z.object({
    speed: z.number().min(0).max(4).default(0.9),
    zoom: z.number().min(0.25).max(4).default(1.15),
    rotation: z.number().min(-2).max(2).default(0.18),
    warp: z.number().min(0).max(1).default(0.42),
    microFluctuation: z.number().min(0).max(1).default(0.18),
    seed: z.number().int().min(1).max(999_999).default(7411),
  }).prefault({}),
  spectrogram: z.object({
    historySize: z.number().int().min(64).max(2048).default(1152),
    gain: z.number().min(0.25).max(4).default(1.55),
    tilt: z.number().min(-1).max(1).default(0.14),
    mirror: z.boolean().default(false),
  }).prefault({}),
  particles: z.object({
    count: z.number().int().min(24).max(1200).default(360),
    size: z.number().min(0.5).max(18).default(3),
    trails: z.number().min(0).max(0.96).default(0.86),
  }).prefault({}),
  automation: z.array(VisualizerAutomationSchema).default([
    { target: "brightness", feature: "rms", depth: 0.68, smoothing: 0.34, invert: false },
    { target: "zoom", feature: "bass", depth: 0.36, smoothing: 0.42, invert: false },
    { target: "hueShift", feature: "centroid", depth: 0.58, smoothing: 0.5, invert: false },
    { target: "grain", feature: "flux", depth: 0.24, smoothing: 0.25, invert: false },
  ]),
  metadata: z.object({
    rationale: z.string().default("Maps FFT, waveform, spectral centroid, flux, and onset features to the visual system."),
    tags: z.array(z.string()).default(["audio-reactive", "spectrogram", "performance"]),
  }).prefault({}),
});

export type VisualizerMode = z.infer<typeof VisualizerModeSchema>;
export type VisualizerPalette = z.infer<typeof VisualizerPaletteSchema>;
export type VisualizerAudioSource = z.infer<typeof VisualizerAudioSourceSchema>;
export type VisualizerFeature = z.infer<typeof VisualizerFeatureSchema>;
export type VisualizerScene = z.infer<typeof VisualizerSceneSchema>;

export function createDefaultVisualizerScene(prompt = ""): VisualizerScene {
  return VisualizerSceneSchema.parse({
    prompt,
    metadata: {
      rationale: prompt
        ? `Prompt-shaped visual scene for: ${prompt}`
        : "Maps FFT, waveform, spectral centroid, flux, and onset features to the visual system.",
      tags: prompt ? ["audio-reactive", "prompt-shaped"] : undefined,
    },
  });
}
