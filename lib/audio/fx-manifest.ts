import { z } from "zod";

export const FxPatternSchemaVersion = 1;

export const FxSlotIdSchema = z.enum(["A", "B", "C", "D"]);

export const FxKindSchema = z.enum([
  "none",
  "repeat",
  "chorus",
  "delay",
  "reverb",
  "hall-reverb",
  "hybrid-reverb",
  "reverse-reverb",
  "spx-hall",
  "spx-room",
  "spx-stage",
  "spx-early-reflection-reverse",
  "spx-reverse-gate",
  "spx-symphonic",
  "spx-stereo-flange",
  "spx-auto-pan",
  "fx500-soft-focus",
  "fx500-reverb-delay",
  "fx500-reverb-into-delay",
  "fx500-delay-into-reverb",
  "motif-cross-delay",
  "motif-ensemble-detune",
  "motif-ring-modulator",
  "motif-dynamic-filter",
  "motif-isolator",
  "motif-slice",
  "a3000-low-resolution",
  "a3000-noisy-mod-delay",
  "emu-z-plane-morph",
  "emu-vowel-morph",
]);

export const FxFamilySchema = z.enum([
  "a3000",
  "emu",
  "fx500",
  "motif",
  "spx",
  "utility",
]);

export const FxTagSchema = z.enum([
  "ambient",
  "dub",
  "industrial",
  "jungle",
  "lofi",
  "shoegaze",
  "utility",
]);

export const FxModelSchema = z.enum([
  "passthrough",
  "delay-line",
  "multi-tap-delay",
  "modulated-delay",
  "algorithmic-reverb",
  "early-reflection",
  "gated-reverb",
  "reverse-reverb",
  "hybrid-reverb",
  "composite-chain",
  "pan-mod",
  "lofi-sampler",
  "waveshaper-drive",
  "ring-mod",
  "dynamic-filter",
  "filter-bank-morph",
  "slice-gate",
]);

export const FxParameterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
]);

const FxParameterOptionSchema = z.object({
  label: z.string().min(1),
  value: FxParameterValueSchema,
});

export const FxParameterManifestSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(FxParameterOptionSchema).optional(),
  step: z.number().positive().optional(),
  unit: z.string().optional(),
});

const DEFAULT_FX_PROBABILITY_INPUT = {
  enabled: false,
  intervalSteps: 16,
  chance: 0.5,
  missWet: 0,
  minWet: 0.25,
  maxWet: 0.85,
  smoothMs: 15,
} as const;

export const FxProbabilitySchema = z
  .object({
    enabled: z.boolean().default(false),
    intervalSteps: z.number().int().min(1).max(256).default(16),
    chance: z.number().min(0).max(1).default(0.5),
    missWet: z.number().min(0).max(1).default(0),
    minWet: z.number().min(0).max(1).default(0.25),
    maxWet: z.number().min(0).max(1).default(0.85),
    smoothMs: z.number().min(0).max(2000).default(15),
  })
  .refine((value) => value.minWet <= value.maxWet, {
    message: "minWet must be less than or equal to maxWet",
    path: ["maxWet"],
  })
  .default(DEFAULT_FX_PROBABILITY_INPUT);

export const FxManifestSchema = z.object({
  slug: FxKindSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  family: FxFamilySchema.default("utility"),
  model: FxModelSchema,
  tags: z.array(FxTagSchema).default(["utility"]),
  defaultWet: z.number().min(0).max(1),
  defaultParams: z.record(z.string(), FxParameterValueSchema).default({}),
  parameters: z.array(FxParameterManifestSchema).default([]),
});

export const FxSlotSchema = z.object({
  id: FxSlotIdSchema,
  effect: FxKindSchema.default("none"),
  wet: z.number().min(0).max(1).default(0.35),
  params: z.record(z.string(), FxParameterValueSchema).default({}),
  probability: FxProbabilitySchema,
});

const DEFAULT_FX_SLOTS_INPUT = FxSlotIdSchema.options.map((id) => ({
  id,
  effect: "none" as const,
  params: {},
  probability: DEFAULT_FX_PROBABILITY_INPUT,
  wet: 0.35,
}));

export const FxPatternSchema = z
  .object({
    schemaVersion: z
      .literal(FxPatternSchemaVersion)
      .default(FxPatternSchemaVersion),
    slots: z.array(FxSlotSchema).default(DEFAULT_FX_SLOTS_INPUT),
  })
  .transform((pattern) => ({
    ...pattern,
    slots: normalizeFxSlots(pattern.slots),
  }));

export type FxSlotId = z.infer<typeof FxSlotIdSchema>;
export type FxKind = z.infer<typeof FxKindSchema>;
export type FxFamily = z.infer<typeof FxFamilySchema>;
export type FxModel = z.infer<typeof FxModelSchema>;
export type FxProbability = z.infer<typeof FxProbabilitySchema>;
export type FxParameterValue = z.infer<typeof FxParameterValueSchema>;
export type FxParameterManifest = z.infer<typeof FxParameterManifestSchema>;
export type FxManifest = z.infer<typeof FxManifestSchema>;
export type FxSlot = z.infer<typeof FxSlotSchema>;
export type FxPattern = z.infer<typeof FxPatternSchema>;
export type FxPatternInput = z.input<typeof FxPatternSchema>;

export type FxAutomationEvent = {
  slotId: FxSlotId;
  stepIndex: number;
  timeSec: number;
  chance: number;
  missWet: number;
  minWet: number;
  maxWet: number;
  smoothSec: number;
};

const delayTimeOptions = [
  { label: "32n", value: "32n" },
  { label: "16n", value: "16n" },
  { label: "8n", value: "8n" },
  { label: "8n.", value: "8n." },
  { label: "4n", value: "4n" },
];

const reflectionTypeOptions = [
  { label: "Hall", value: "hall" },
  { label: "Random", value: "random" },
  { label: "Plate", value: "plate" },
  { label: "Reverse", value: "reverse" },
];

const zPlaneFrameOptions = [
  { label: "Vocal Peaks", value: "vocal-peaks" },
  { label: "Notch Sweep", value: "notch-sweep" },
  { label: "Liquid Bass", value: "liquid-bass" },
  { label: "Glass Phaser", value: "glass-phaser" },
];

export const BUILT_IN_FX_MANIFESTS: FxManifest[] = [
  {
    slug: "none",
    name: "None",
    description: "Bypass slot that passes audio through unchanged.",
    family: "utility",
    model: "passthrough",
    tags: ["utility"],
    defaultWet: 0,
    defaultParams: {},
    parameters: [],
  },
  {
    slug: "repeat",
    name: "Repeat",
    description: "Tempo-synced short feedback delay for rhythmic repeats.",
    family: "utility",
    model: "delay-line",
    tags: ["dub", "jungle", "utility"],
    defaultWet: 0.42,
    defaultParams: { delayTime: "16n", feedback: 0.62 },
    parameters: [
      { key: "delayTime", label: "time", options: delayTimeOptions },
      { key: "feedback", label: "feedback", min: 0, max: 0.9, step: 0.01 },
    ],
  },
  {
    slug: "chorus",
    name: "Chorus",
    description: "Stereo modulated delay-line chorus for width and motion.",
    family: "utility",
    model: "modulated-delay",
    tags: ["ambient", "shoegaze", "utility"],
    defaultWet: 0.32,
    defaultParams: { depth: 0.58, delayMs: 4.5, feedback: 0.08, frequencyHz: 0.72 },
    parameters: [
      { key: "depth", label: "depth", min: 0, max: 1, step: 0.01 },
      { key: "frequencyHz", label: "rate", min: 0.02, max: 8, step: 0.01, unit: "hz" },
    ],
  },
  {
    slug: "delay",
    name: "Delay",
    description: "Tempo-synced feedback delay with a longer musical echo.",
    family: "utility",
    model: "delay-line",
    tags: ["dub", "utility"],
    defaultWet: 0.36,
    defaultParams: { delayTime: "8n.", feedback: 0.42 },
    parameters: [
      { key: "delayTime", label: "time", options: delayTimeOptions },
      { key: "feedback", label: "feedback", min: 0, max: 0.9, step: 0.01 },
    ],
  },
  {
    slug: "reverb",
    name: "Reverb",
    description: "Generated impulse-response reverb for compact room space.",
    family: "utility",
    model: "algorithmic-reverb",
    tags: ["ambient", "utility"],
    defaultWet: 0.3,
    defaultParams: { decay: 2.4, damping: 0.42, preDelay: 0.015 },
    parameters: [
      { key: "decay", label: "decay", min: 0.2, max: 12, step: 0.1, unit: "s" },
      { key: "damping", label: "damp", min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    slug: "hall-reverb",
    name: "Hall Reverb",
    description: "Long generated impulse-response reverb tuned for hall tails.",
    family: "utility",
    model: "algorithmic-reverb",
    tags: ["ambient", "shoegaze", "utility"],
    defaultWet: 0.34,
    defaultParams: { decay: 7.2, damping: 0.55, preDelay: 0.035 },
    parameters: [
      { key: "decay", label: "decay", min: 0.2, max: 12, step: 0.1, unit: "s" },
      { key: "preDelay", label: "pre", min: 0, max: 0.2, step: 0.005, unit: "s" },
    ],
  },
  {
    slug: "hybrid-reverb",
    name: "Hybrid Reverb",
    description: "Early-reflection delay into a generated reverb tail.",
    family: "utility",
    model: "hybrid-reverb",
    tags: ["ambient", "dub", "shoegaze"],
    defaultWet: 0.38,
    defaultParams: {
      delayTime: "32n",
      earlyFeedback: 0.18,
      decay: 4.8,
      preDelay: 0.025,
    },
    parameters: [
      { key: "delayTime", label: "early time", options: delayTimeOptions },
      { key: "earlyFeedback", label: "early", min: 0, max: 0.6, step: 0.01 },
      { key: "decay", label: "decay", min: 0.2, max: 12, step: 0.1, unit: "s" },
    ],
  },
  {
    slug: "reverse-reverb",
    name: "Reverse Reverb",
    description: "Old Yamaha SPX-style nonlinear reverse bloom with an abrupt gate.",
    family: "spx",
    model: "reverse-reverb",
    tags: ["ambient", "shoegaze"],
    defaultWet: 0.44,
    defaultParams: {
      decay: 2.8,
      density: 0.78,
      preDelay: 0.045,
      swell: 0.82,
    },
    parameters: [
      { key: "swell", label: "swell", min: 0, max: 1, step: 0.01 },
      { key: "decay", label: "length", min: 0.2, max: 6, step: 0.1, unit: "s" },
      { key: "preDelay", label: "pre", min: 0, max: 0.2, step: 0.005, unit: "s" },
    ],
  },
  {
    slug: "spx-hall",
    name: "SPX Hall",
    description: "Dark Yamaha SPX-inspired hall algorithm with grainy digital density.",
    family: "spx",
    model: "algorithmic-reverb",
    tags: ["ambient", "shoegaze"],
    defaultWet: 0.36,
    defaultParams: { decay: 5.8, damping: 0.7, preDelay: 0.03 },
    parameters: [
      { key: "decay", label: "decay", min: 0.5, max: 12, step: 0.1, unit: "s" },
      { key: "damping", label: "damp", min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    slug: "spx-room",
    name: "SPX Room",
    description: "Short SPX room with dense early reflection color.",
    family: "spx",
    model: "early-reflection",
    tags: ["jungle", "utility"],
    defaultWet: 0.28,
    defaultParams: { decay: 1.25, density: 0.72, preDelay: 0.008, type: "random" },
    parameters: [
      { key: "type", label: "type", options: reflectionTypeOptions },
      { key: "decay", label: "size", min: 0.1, max: 3, step: 0.05, unit: "s" },
      { key: "density", label: "density", min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    slug: "spx-stage",
    name: "SPX Stage",
    description: "Medium SPX stage ambience with a clear pre-delay slap.",
    family: "spx",
    model: "algorithmic-reverb",
    tags: ["ambient", "utility"],
    defaultWet: 0.31,
    defaultParams: { decay: 3.4, damping: 0.48, preDelay: 0.055 },
    parameters: [
      { key: "decay", label: "decay", min: 0.5, max: 8, step: 0.1, unit: "s" },
      { key: "preDelay", label: "pre", min: 0, max: 0.15, step: 0.005, unit: "s" },
    ],
  },
  {
    slug: "spx-early-reflection-reverse",
    name: "SPX Early Reflection Reverse",
    description: "Reverse-pattern SPX early reflections for pre-swell shoegaze hits.",
    family: "spx",
    model: "early-reflection",
    tags: ["shoegaze", "ambient"],
    defaultWet: 0.42,
    defaultParams: { decay: 1.8, density: 0.82, preDelay: 0.025, type: "reverse" },
    parameters: [
      { key: "decay", label: "length", min: 0.1, max: 4, step: 0.05, unit: "s" },
      { key: "density", label: "density", min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    slug: "spx-reverse-gate",
    name: "SPX Reverse Gate",
    description: "Reverse bloom into a hard gated SPX-style reverb envelope.",
    family: "spx",
    model: "gated-reverb",
    tags: ["shoegaze", "industrial"],
    defaultWet: 0.48,
    defaultParams: {
      decay: 2.2,
      density: 0.88,
      gateRelease: 0.18,
      preDelay: 0.035,
      swell: 0.9,
    },
    parameters: [
      { key: "swell", label: "swell", min: 0, max: 1, step: 0.01 },
      { key: "gateRelease", label: "gate", min: 0.02, max: 0.8, step: 0.01, unit: "s" },
    ],
  },
  {
    slug: "spx-symphonic",
    name: "SPX Symphonic",
    description: "Wide Yamaha Symphonic-style dimension chorus with slow stereo drift.",
    family: "spx",
    model: "modulated-delay",
    tags: ["ambient", "shoegaze"],
    defaultWet: 0.46,
    defaultParams: { delayMs: 10.5, depth: 0.78, feedback: 0.04, frequencyHz: 0.18 },
    parameters: [
      { key: "depth", label: "depth", min: 0, max: 1, step: 0.01 },
      { key: "frequencyHz", label: "rate", min: 0.02, max: 2, step: 0.01, unit: "hz" },
    ],
  },
  {
    slug: "spx-stereo-flange",
    name: "SPX Stereo Flange",
    description: "Short stereo modulated delay with metallic SPX feedback.",
    family: "spx",
    model: "modulated-delay",
    tags: ["industrial", "shoegaze"],
    defaultWet: 0.35,
    defaultParams: { delayMs: 2.1, depth: 0.72, feedback: 0.42, frequencyHz: 0.26 },
    parameters: [
      { key: "feedback", label: "regen", min: 0, max: 0.85, step: 0.01 },
      { key: "frequencyHz", label: "rate", min: 0.02, max: 4, step: 0.01, unit: "hz" },
    ],
  },
  {
    slug: "spx-auto-pan",
    name: "SPX Auto Pan",
    description: "SPX auto-pan LFO for tremolo-width movement.",
    family: "spx",
    model: "pan-mod",
    tags: ["dub", "utility"],
    defaultWet: 0.38,
    defaultParams: { depth: 0.82, frequencyHz: 0.5 },
    parameters: [
      { key: "depth", label: "depth", min: 0, max: 1, step: 0.01 },
      { key: "frequencyHz", label: "rate", min: 0.02, max: 12, step: 0.01, unit: "hz" },
    ],
  },
  {
    slug: "fx500-soft-focus",
    name: "FX500 Soft Focus",
    description: "Shoegaze FX500 Soft Focus-inspired reverb, Symphonic chorus, and pitch bloom.",
    family: "fx500",
    model: "composite-chain",
    tags: ["ambient", "shoegaze"],
    defaultWet: 0.58,
    defaultParams: {
      chorusDepth: 0.68,
      decay: 6.8,
      delayTime: "8n.",
      pitchCents: 700,
      shimmer: 0.16,
    },
    parameters: [
      { key: "decay", label: "verb", min: 1, max: 12, step: 0.1, unit: "s" },
      { key: "chorusDepth", label: "sym", min: 0, max: 1, step: 0.01 },
      { key: "shimmer", label: "pitch", min: 0, max: 0.5, step: 0.01 },
    ],
  },
  {
    slug: "fx500-reverb-delay",
    name: "FX500 Reverb + Delay",
    description: "Parallel FX500-style reverb and digital delay patch.",
    family: "fx500",
    model: "hybrid-reverb",
    tags: ["dub", "shoegaze"],
    defaultWet: 0.42,
    defaultParams: { decay: 4.4, delayTime: "4n", earlyFeedback: 0.34, preDelay: 0.02 },
    parameters: [
      { key: "delayTime", label: "delay", options: delayTimeOptions },
      { key: "earlyFeedback", label: "delay fb", min: 0, max: 0.75, step: 0.01 },
    ],
  },
  {
    slug: "fx500-reverb-into-delay",
    name: "FX500 Reverb -> Delay",
    description: "FX500-style reverb smear feeding tempo delay repeats.",
    family: "fx500",
    model: "hybrid-reverb",
    tags: ["dub", "shoegaze"],
    defaultWet: 0.44,
    defaultParams: { decay: 5.2, delayTime: "8n.", earlyFeedback: 0.42, preDelay: 0.03 },
    parameters: [
      { key: "decay", label: "verb", min: 0.5, max: 10, step: 0.1, unit: "s" },
      { key: "earlyFeedback", label: "fb", min: 0, max: 0.8, step: 0.01 },
    ],
  },
  {
    slug: "fx500-delay-into-reverb",
    name: "FX500 Delay -> Reverb",
    description: "FX500-style digital delay softened by a reverb tail.",
    family: "fx500",
    model: "hybrid-reverb",
    tags: ["dub", "ambient"],
    defaultWet: 0.4,
    defaultParams: { decay: 3.8, delayTime: "8n", earlyFeedback: 0.5, preDelay: 0.018 },
    parameters: [
      { key: "delayTime", label: "delay", options: delayTimeOptions },
      { key: "decay", label: "tail", min: 0.5, max: 10, step: 0.1, unit: "s" },
    ],
  },
  {
    slug: "motif-cross-delay",
    name: "Motif Cross Delay",
    description: "Motif-style stereo cross-feedback delay for dub throws.",
    family: "motif",
    model: "multi-tap-delay",
    tags: ["dub", "jungle"],
    defaultWet: 0.38,
    defaultParams: { delayTime: "8n.", feedback: 0.46, spread: 0.52 },
    parameters: [
      { key: "delayTime", label: "time", options: delayTimeOptions },
      { key: "feedback", label: "feedback", min: 0, max: 0.9, step: 0.01 },
    ],
  },
  {
    slug: "motif-ensemble-detune",
    name: "Ensemble Detune",
    description: "Motif ensemble detune with micro-shifted delay layers.",
    family: "motif",
    model: "modulated-delay",
    tags: ["ambient", "shoegaze"],
    defaultWet: 0.36,
    defaultParams: { delayMs: 7.5, depth: 0.32, feedback: 0.02, frequencyHz: 0.06 },
    parameters: [
      { key: "depth", label: "detune", min: 0, max: 1, step: 0.01 },
      { key: "delayMs", label: "spread", min: 1, max: 24, step: 0.1, unit: "ms" },
    ],
  },
  {
    slug: "motif-ring-modulator",
    name: "Ring Modulator",
    description: "Motif-style metallic ring modulation for tuned percussion and bass.",
    family: "motif",
    model: "ring-mod",
    tags: ["industrial", "jungle"],
    defaultWet: 0.28,
    defaultParams: { frequencyHz: 44, toneHz: 4200 },
    parameters: [
      { key: "frequencyHz", label: "freq", min: 5, max: 1400, step: 1, unit: "hz" },
      { key: "toneHz", label: "tone", min: 250, max: 12000, step: 10, unit: "hz" },
    ],
  },
  {
    slug: "motif-dynamic-filter",
    name: "Dynamic Filter",
    description: "Envelope/LFO-style Motif dynamic filter for break and bass movement.",
    family: "motif",
    model: "dynamic-filter",
    tags: ["jungle", "dub"],
    defaultWet: 0.4,
    defaultParams: { baseFrequencyHz: 480, depth: 0.75, frequencyHz: 1.5, octaves: 3.2, q: 5.5 },
    parameters: [
      { key: "baseFrequencyHz", label: "base", min: 80, max: 6000, step: 10, unit: "hz" },
      { key: "depth", label: "depth", min: 0, max: 1, step: 0.01 },
      { key: "frequencyHz", label: "rate", min: 0.05, max: 12, step: 0.01, unit: "hz" },
    ],
  },
  {
    slug: "motif-isolator",
    name: "Isolator",
    description: "Motif DJ-style isolator for carving lows and highs.",
    family: "motif",
    model: "filter-bank-morph",
    tags: ["dub", "jungle"],
    defaultWet: 0.35,
    defaultParams: { frameA: "liquid-bass", frameB: "notch-sweep", morph: 0.38, resonance: 0.4 },
    parameters: [
      { key: "morph", label: "morph", min: 0, max: 1, step: 0.01 },
      { key: "resonance", label: "res", min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    slug: "motif-slice",
    name: "Motif Slice",
    description: "Tempo-sliced gate motion for jungle edits and tremolo stutters.",
    family: "motif",
    model: "slice-gate",
    tags: ["jungle", "industrial"],
    defaultWet: 0.45,
    defaultParams: { depth: 0.82, frequencyHz: 8 },
    parameters: [
      { key: "depth", label: "depth", min: 0, max: 1, step: 0.01 },
      { key: "frequencyHz", label: "rate", min: 0.5, max: 32, step: 0.5, unit: "hz" },
    ],
  },
  {
    slug: "a3000-low-resolution",
    name: "A3000 Low Resolution",
    description: "Yamaha A3000-style bit depth and sample-rate degradation.",
    family: "a3000",
    model: "lofi-sampler",
    tags: ["jungle", "lofi"],
    defaultWet: 0.42,
    defaultParams: { bits: 6, sampleRateHz: 11025, toneHz: 6200 },
    parameters: [
      { key: "bits", label: "bits", min: 3, max: 14, step: 1 },
      { key: "sampleRateHz", label: "rate", min: 3000, max: 44100, step: 100, unit: "hz" },
    ],
  },
  {
    slug: "a3000-noisy-mod-delay",
    name: "A3000 Noisy Mod Delay",
    description: "A3000-style noisy modulated delay for degraded jungle throws.",
    family: "a3000",
    model: "modulated-delay",
    tags: ["jungle", "lofi"],
    defaultWet: 0.44,
    defaultParams: { delayMs: 18, depth: 0.68, feedback: 0.55, frequencyHz: 1.35, noise: 0.2 },
    parameters: [
      { key: "feedback", label: "feedback", min: 0, max: 0.9, step: 0.01 },
      { key: "noise", label: "noise", min: 0, max: 0.6, step: 0.01 },
    ],
  },
  {
    slug: "emu-z-plane-morph",
    name: "E-mu Z-Plane Morph",
    description: "E-mu inspired morphing filter bank for moving peaks, notches, and bass formants.",
    family: "emu",
    model: "filter-bank-morph",
    tags: ["ambient", "jungle", "shoegaze"],
    defaultWet: 0.43,
    defaultParams: {
      frameA: "liquid-bass",
      frameB: "glass-phaser",
      morph: 0.5,
      resonance: 0.72,
    },
    parameters: [
      { key: "frameA", label: "from", options: zPlaneFrameOptions },
      { key: "frameB", label: "to", options: zPlaneFrameOptions },
      { key: "morph", label: "morph", min: 0, max: 1, step: 0.01 },
      { key: "resonance", label: "res", min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    slug: "emu-vowel-morph",
    name: "E-mu Vowel Morph",
    description: "Z-plane inspired vowel formant movement for pads, breaks, and bass.",
    family: "emu",
    model: "filter-bank-morph",
    tags: ["ambient", "jungle", "shoegaze"],
    defaultWet: 0.36,
    defaultParams: {
      frameA: "vocal-peaks",
      frameB: "notch-sweep",
      morph: 0.35,
      resonance: 0.65,
    },
    parameters: [
      { key: "frameA", label: "from", options: zPlaneFrameOptions },
      { key: "frameB", label: "to", options: zPlaneFrameOptions },
      { key: "morph", label: "morph", min: 0, max: 1, step: 0.01 },
    ],
  },
];

export const BUILT_IN_FX_KINDS = BUILT_IN_FX_MANIFESTS.map(
  (manifest) => manifest.slug,
) as [FxKind, ...FxKind[]];

export const AgentFxSchema = z
  .object({
    enabled: z.boolean().default(false),
    slots: z.array(FxSlotIdSchema).optional(),
    allowedEffects: z.array(FxKindSchema).optional(),
    defaultPattern: FxPatternSchema.optional(),
  })
  .default({
    enabled: false,
  });

export type AgentFx = z.infer<typeof AgentFxSchema>;

export const DEFAULT_FX_PATTERN = FxPatternSchema.parse({});

export function normalizeFxPattern(pattern?: FxPatternInput | null): FxPattern {
  return FxPatternSchema.parse(pattern ?? DEFAULT_FX_PATTERN);
}

export function getFxManifest(kind: FxKind): FxManifest {
  return (
    BUILT_IN_FX_MANIFESTS.find((manifest) => manifest.slug === kind) ??
    BUILT_IN_FX_MANIFESTS[0]
  );
}

export function getFxDefaultWet(kind: FxKind): number {
  return getFxManifest(kind).defaultWet;
}

export function getFxDefaultParams(kind: FxKind): Record<string, FxParameterValue> {
  return { ...getFxManifest(kind).defaultParams };
}

export function getFxSlotParams(slot: Pick<FxSlot, "effect" | "params">) {
  return {
    ...getFxDefaultParams(slot.effect),
    ...slot.params,
  };
}

export function getFxSlotInitialWet(slot: FxSlot): number {
  return slot.probability.enabled ? slot.probability.missWet : slot.wet;
}

export function hasFxSlotPotential(slot: FxSlot): boolean {
  if (slot.effect === "none") {
    return false;
  }

  if (!slot.probability.enabled) {
    return slot.wet > 0;
  }

  return slot.probability.missWet > 0 || (slot.probability.chance > 0 && slot.probability.maxWet > 0);
}

export function updateFxSlot(
  pattern: FxPatternInput,
  slotId: FxSlotId,
  patch: Partial<Omit<FxSlot, "id">>,
): FxPattern {
  const normalized = normalizeFxPattern(pattern);
  return FxPatternSchema.parse({
    ...normalized,
    slots: normalized.slots.map((slot) => {
      if (slot.id !== slotId) {
        return slot;
      }

      const effectChanged =
        patch.effect !== undefined && patch.effect !== slot.effect;
      const effect = patch.effect ?? slot.effect;

      return {
        ...slot,
        ...patch,
        effect,
        params:
          patch.params ??
          (effectChanged ? getFxDefaultParams(effect) : slot.params),
        wet:
          effectChanged && patch.wet === undefined
            ? getFxDefaultWet(effect)
            : patch.wet ?? slot.wet,
      };
    }),
  });
}

export function updateFxSlotParam(
  pattern: FxPatternInput,
  slotId: FxSlotId,
  key: string,
  value: FxParameterValue,
): FxPattern {
  const normalized = normalizeFxPattern(pattern);
  const slot = normalized.slots.find((candidate) => candidate.id === slotId);
  if (!slot) {
    return normalized;
  }

  return updateFxSlot(normalized, slotId, {
    params: {
      ...slot.params,
      [key]: value,
    },
  });
}

export function updateFxSlotProbability(
  pattern: FxPatternInput,
  slotId: FxSlotId,
  patch: Partial<FxProbability>,
): FxPattern {
  const normalized = normalizeFxPattern(pattern);
  return FxPatternSchema.parse({
    ...normalized,
    slots: normalized.slots.map((slot) =>
      slot.id === slotId
        ? {
            ...slot,
            probability: normalizeFxProbabilityPatch(slot.probability, patch),
          }
        : slot,
    ),
  });
}

export function serializeFxPattern(pattern?: FxPatternInput | null): string {
  const normalized = normalizeFxPattern(pattern);
  return JSON.stringify({
    schemaVersion: normalized.schemaVersion,
    slots: normalized.slots.map((slot) => ({
      id: slot.id,
      effect: slot.effect,
      params: roundFxParams(getFxSlotParams(slot)),
      probability: {
        enabled: slot.probability.enabled,
        intervalSteps: slot.probability.intervalSteps,
        chance: roundFxNumber(slot.probability.chance),
        missWet: roundFxNumber(slot.probability.missWet),
        minWet: roundFxNumber(slot.probability.minWet),
        maxWet: roundFxNumber(slot.probability.maxWet),
        smoothMs: roundFxNumber(slot.probability.smoothMs),
      },
      wet: roundFxNumber(slot.wet),
    })),
  });
}

export function hasAudibleFx(pattern?: FxPatternInput | null): boolean {
  return normalizeFxPattern(pattern).slots.some((slot) => hasFxSlotPotential(slot));
}

export function collectFxAutomationEvents({
  fxPattern,
  stepDurationSec,
  totalSteps,
}: {
  fxPattern?: FxPatternInput | null;
  stepDurationSec: number;
  totalSteps: number;
}): FxAutomationEvent[] {
  if (totalSteps <= 0 || stepDurationSec <= 0) {
    return [];
  }

  const normalized = normalizeFxPattern(fxPattern);
  const events: FxAutomationEvent[] = [];

  for (const slot of normalized.slots) {
    if (slot.effect === "none" || !slot.probability.enabled) {
      continue;
    }

    for (
      let stepIndex = 0;
      stepIndex < totalSteps;
      stepIndex += slot.probability.intervalSteps
    ) {
      events.push({
        slotId: slot.id,
        stepIndex,
        timeSec: stepIndex * stepDurationSec,
        chance: slot.probability.chance,
        missWet: slot.probability.missWet,
        minWet: slot.probability.minWet,
        maxWet: slot.probability.maxWet,
        smoothSec: slot.probability.smoothMs / 1000,
      });
    }
  }

  return events.sort((left, right) => left.timeSec - right.timeSec);
}

export function resolveFxAutomationWet(
  event: Pick<FxAutomationEvent, "chance" | "maxWet" | "minWet" | "missWet">,
  random: () => number = Math.random,
): number {
  if (event.chance <= 0 || random() > event.chance) {
    return event.missWet;
  }

  if (event.maxWet <= event.minWet) {
    return event.minWet;
  }

  return event.minWet + (event.maxWet - event.minWet) * random();
}

function normalizeFxSlots(slots: FxSlot[]): FxSlot[] {
  const byId = new Map(slots.map((slot) => [slot.id, slot]));

  return FxSlotIdSchema.options.map((id) => {
    const defaultSlot = DEFAULT_FX_SLOTS_INPUT.find((slot) => slot.id === id);
    const slot = byId.get(id) ?? FxSlotSchema.parse(defaultSlot);

    return {
      ...slot,
      params: getFxSlotParams(slot),
    };
  });
}

function normalizeFxProbabilityPatch(
  current: FxProbability,
  patch: Partial<FxProbability>,
): FxProbability {
  const next = {
    ...current,
    ...patch,
  };

  if (patch.minWet !== undefined && next.minWet > next.maxWet) {
    next.maxWet = next.minWet;
  }
  if (patch.maxWet !== undefined && next.maxWet < next.minWet) {
    next.minWet = next.maxWet;
  }

  return FxProbabilitySchema.parse(next);
}

function roundFxParams(params: Record<string, FxParameterValue>) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      typeof value === "number" ? roundFxNumber(value) : value,
    ]),
  );
}

function roundFxNumber(value: number): number {
  return Number(value.toFixed(4));
}
