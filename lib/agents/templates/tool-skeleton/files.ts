import {
  type AgentManifest,
  AgentManifestSchema,
} from "@/lib/agents/contract";
import type { SampleRole } from "@/lib/samples/roles";

import {
  escapeString,
  toCamelCase,
  toPascalCase,
} from "@/lib/agents/templates/tool-skeleton/shared";
import { renderSampleClient } from "@/lib/agents/templates/tool-skeleton/render-sample-client";
import { renderSynthClient } from "@/lib/agents/templates/tool-skeleton/render-synth-client";
import { renderEffectClient } from "@/lib/agents/templates/tool-skeleton/render-effect-client";
import { renderHybridClient } from "@/lib/agents/templates/tool-skeleton/render-hybrid-client";

export type ToolSkeletonInput = {
  slug: string;
  name: string;
  description: string;
  capabilities?: string[];
  sampleRoles?: SampleRole[];
  instrumentType?: "sample" | "synth" | "hybrid" | "effect" | "visualizer";
};

export type ToolSkeletonInstance = {
  manifest: AgentManifest;
  files: Map<string, string>;
};

export const SUPPORTED_TOOL_SKELETON_INSTRUMENTS = [
  "sample",
  "synth",
  "effect",
  "hybrid",
  "visualizer",
] as const;

export function createToolSkeleton(
  input: ToolSkeletonInput,
): ToolSkeletonInstance {
  const instrumentType = input.instrumentType ?? "sample";
  if (instrumentType === "synth") {
    return createSynthToolSkeleton(input);
  }
  if (instrumentType === "effect") {
    return createEffectToolSkeleton(input);
  }
  if (instrumentType === "hybrid") {
    return createHybridToolSkeleton(input);
  }
  if (instrumentType === "visualizer") {
    return createVisualizerToolSkeleton(input);
  }

  const instrument = resolveSampleSkeletonInstrument(instrumentType);
  const manifest = AgentManifestSchema.parse({
    name: input.name,
    slug: input.slug,
    level: 1,
    origin: "generated",
    description: input.description,
    route: `/tools/${input.slug}`,
    instrument,
    capabilities: input.capabilities ?? ["generatePattern", "play", "recordOutput"],
    inputs: {
      samples: input.sampleRoles ?? ["loop", "oneshot", "melodic", "pad", "fx"],
      bpm: true,
      globalBpm: true,
      globalKey: true,
      scaleSearch: true,
      prompt: true,
      requiredAnalysis: ["global.true_peak_dbfs", "rhythm.onsets_s", "envelope.attack_ms", "slices"],
    },
    musicContext: {
      globalBpm: true,
      globalKey: true,
      scaleSearch: true,
    },
    outputs: { pattern: true, synthScene: false, midi: false, audio: true, recording: true },
    exports: {
      document: "pattern",
      audio: {
        strategy: "offline-render",
        formats: ["wav"],
        maxDefaultDurationSec: 120,
        requiresUserGestureForPreview: true,
      },
    },
    autonomy: "assist",
    status: "enabled",
  });
  const exportName = `${toCamelCase(input.slug)}Manifest`;
  const files = new Map<string, string>([
    [`app/tools/${input.slug}/manifest.ts`, renderManifest(manifest, exportName)],
    [`app/tools/${input.slug}/page.tsx`, renderPage(input.slug, input.name)],
    [`app/tools/${input.slug}/client.tsx`, renderSampleClient(input.slug, input.name, input.description)],
    [`app/tools/${input.slug}/render.ts`, renderSampleOfflineRenderer(input.slug)],
    [`app/tools/${input.slug}/render.audio.test.ts`, renderOfflineAudioTest(input.slug, "pattern")],
    [`app/tools/${input.slug}/lib/prompt.ts`, renderPrompt(input.slug, input.name, input.description)],
    [`app/tools/${input.slug}/__tests__/manifest.test.ts`, renderManifestTest(exportName)],
    [`app/tools/${input.slug}/client.test.tsx`, renderClientTest(input.slug, input.name)],
    [`app/tools/${input.slug}/lib/prompt.test.ts`, renderPromptTest(input.slug)],
  ]);

  return { manifest, files };
}

function createSynthToolSkeleton(input: ToolSkeletonInput): ToolSkeletonInstance {
  const manifest = AgentManifestSchema.parse({
    name: input.name,
    slug: input.slug,
    level: 1,
    origin: "generated",
    description: input.description,
    route: `/tools/${input.slug}`,
    instrument: {
      type: "synth",
      workflow: "synth-scene",
      document: "synth-scene",
      usesSamples: false,
      usesSynthesis: true,
    },
    capabilities: input.capabilities ?? ["generateSynthScene", "play", "exportMidi", "fxSlots", "recordOutput"],
    inputs: {
      samples: [],
      bpm: true,
      globalBpm: true,
      globalKey: true,
      scaleSearch: true,
      prompt: true,
      requiredAnalysis: [],
    },
    musicContext: {
      globalBpm: true,
      globalKey: true,
      scaleSearch: true,
    },
    outputs: { pattern: false, synthScene: true, midi: true, audio: true, recording: true },
    exports: {
      document: "synth-scene",
      audio: {
        strategy: "offline-render",
        formats: ["wav"],
        maxDefaultDurationSec: 600,
        requiresUserGestureForPreview: true,
      },
      midi: {
        strategy: "standard-midi-file",
        format: "smf-1",
        ticksPerQuarter: 480,
        preservesTracks: true,
        supportsPitchBend: true,
        supportsCc: false,
      },
    },
    fx: {
      enabled: true,
    },
    autonomy: "assist",
    status: "enabled",
  });
  const exportName = `${toCamelCase(input.slug)}Manifest`;
  const files = new Map<string, string>([
    [`app/tools/${input.slug}/manifest.ts`, renderManifest(manifest, exportName)],
    [`app/tools/${input.slug}/page.tsx`, renderPage(input.slug, input.name)],
    [`app/tools/${input.slug}/client.tsx`, renderSynthClient(input.slug, input.name, input.description)],
    [`app/tools/${input.slug}/render.ts`, renderSynthOfflineRenderer(input.slug, input.description)],
    [`app/tools/${input.slug}/render.audio.test.ts`, renderOfflineAudioTest(input.slug, "synth-scene")],
    [`app/tools/${input.slug}/lib/prompt.ts`, renderSynthPrompt(input.slug, input.name, input.description)],
    [`app/tools/${input.slug}/__tests__/manifest.test.ts`, renderManifestTest(exportName)],
    [`app/tools/${input.slug}/client.test.tsx`, renderSynthClientTest(input.slug, input.name)],
    [`app/tools/${input.slug}/lib/prompt.test.ts`, renderSynthPromptTest(input.slug)],
  ]);

  return { manifest, files };
}

function createEffectToolSkeleton(input: ToolSkeletonInput): ToolSkeletonInstance {
  const manifest = AgentManifestSchema.parse({
    name: input.name,
    slug: input.slug,
    level: 1,
    origin: "generated",
    description: input.description,
    route: `/tools/${input.slug}`,
    instrument: {
      type: "effect",
      workflow: "audio-stream-effect",
      document: "audio-stream",
      usesSamples: false,
      usesSynthesis: false,
    },
    capabilities: input.capabilities ?? ["promptToEffectPatch", "liveInputEffect", "recordOutput"],
    inputs: {
      samples: [],
      bpm: true,
      globalBpm: true,
      globalKey: false,
      scaleSearch: false,
      prompt: true,
      requiredAnalysis: [],
    },
    musicContext: {
      globalBpm: true,
      globalKey: false,
      scaleSearch: false,
    },
    outputs: { pattern: false, synthScene: false, midi: false, audio: true, recording: true },
    exports: {
      document: "audio-stream",
      audio: {
        strategy: "live-recording",
        formats: ["wav"],
        maxDefaultDurationSec: 120,
        requiresUserGestureForPreview: true,
      },
    },
    autonomy: "assist",
    status: "enabled",
  });
  const exportName = `${toCamelCase(input.slug)}Manifest`;
  const files = new Map<string, string>([
    [`app/tools/${input.slug}/manifest.ts`, renderManifest(manifest, exportName)],
    [`app/tools/${input.slug}/page.tsx`, renderPage(input.slug, input.name)],
    [`app/tools/${input.slug}/client.tsx`, renderEffectClient(input.slug, input.name, input.description)],
    [`app/tools/${input.slug}/render.ts`, renderEffectOfflineRenderer(input.slug)],
    [`app/tools/${input.slug}/render.audio.test.ts`, renderOfflineAudioTest(input.slug, "audio-stream")],
    [`app/tools/${input.slug}/lib/prompt.ts`, renderEffectPrompt(input.slug, input.name, input.description)],
    [`app/tools/${input.slug}/__tests__/manifest.test.ts`, renderManifestTest(exportName)],
    [`app/tools/${input.slug}/client.test.tsx`, renderEffectClientTest(input.slug, input.name)],
    [`app/tools/${input.slug}/lib/prompt.test.ts`, renderEffectPromptTest(input.slug)],
  ]);

  return { manifest, files };
}

function createHybridToolSkeleton(input: ToolSkeletonInput): ToolSkeletonInstance {
  const manifest = AgentManifestSchema.parse({
    name: input.name,
    slug: input.slug,
    level: 1,
    origin: "generated",
    description: input.description,
    route: `/tools/${input.slug}`,
    instrument: {
      type: "hybrid",
      workflow: "sample-informed-synth-scene",
      document: "synth-scene",
      usesSamples: true,
      usesSynthesis: true,
    },
    capabilities: input.capabilities ?? ["sampleContext", "generateSynthScene", "play", "exportMidi", "recordOutput"],
    inputs: {
      samples: input.sampleRoles ?? ["loop", "oneshot", "melodic", "pad", "fx"],
      bpm: true,
      globalBpm: true,
      globalKey: true,
      scaleSearch: true,
      prompt: true,
      requiredAnalysis: ["global.true_peak_dbfs", "rhythm.onsets_s", "slices"],
    },
    musicContext: {
      globalBpm: true,
      globalKey: true,
      scaleSearch: true,
    },
    outputs: { pattern: false, synthScene: true, midi: true, audio: true, recording: true },
    exports: {
      document: "synth-scene",
      audio: {
        strategy: "offline-render",
        formats: ["wav"],
        maxDefaultDurationSec: 600,
        requiresUserGestureForPreview: true,
      },
      midi: {
        strategy: "standard-midi-file",
        format: "smf-1",
        ticksPerQuarter: 480,
        preservesTracks: true,
        supportsPitchBend: true,
        supportsCc: false,
      },
    },
    autonomy: "assist",
    status: "enabled",
  });
  const exportName = `${toCamelCase(input.slug)}Manifest`;
  const files = new Map<string, string>([
    [`app/tools/${input.slug}/manifest.ts`, renderManifest(manifest, exportName)],
    [`app/tools/${input.slug}/page.tsx`, renderPage(input.slug, input.name)],
    [`app/tools/${input.slug}/client.tsx`, renderHybridClient(input.slug, input.name, input.description)],
    [`app/tools/${input.slug}/render.ts`, renderSynthOfflineRenderer(input.slug, input.description)],
    [`app/tools/${input.slug}/render.audio.test.ts`, renderOfflineAudioTest(input.slug, "synth-scene")],
    [`app/tools/${input.slug}/lib/prompt.ts`, renderHybridPrompt(input.slug, input.name, input.description)],
    [`app/tools/${input.slug}/__tests__/manifest.test.ts`, renderManifestTest(exportName)],
    [`app/tools/${input.slug}/client.test.tsx`, renderHybridClientTest(input.slug, input.name)],
    [`app/tools/${input.slug}/lib/prompt.test.ts`, renderHybridPromptTest(input.slug)],
  ]);

  return { manifest, files };
}

function createVisualizerToolSkeleton(input: ToolSkeletonInput): ToolSkeletonInstance {
  const manifest = AgentManifestSchema.parse({
    name: input.name,
    slug: input.slug,
    level: 1,
    origin: "generated",
    description: input.description,
    route: `/tools/${input.slug}`,
    instrument: {
      type: "visualizer",
      workflow: "audio-reactive-visual-scene",
      document: "visual-scene",
      usesSamples: true,
      usesSynthesis: true,
    },
    capabilities: input.capabilities ?? [
      "promptToVisualScene",
      "liveAudioInput",
      "microphoneInput",
      "audioFileInput",
      "spectrogram",
      "audioFeatureMapping",
      "fullscreenVisuals",
    ],
    inputs: {
      samples: input.sampleRoles ?? ["loop", "oneshot", "melodic", "pad", "fx"],
      bpm: true,
      globalBpm: true,
      globalKey: false,
      scaleSearch: false,
      prompt: true,
      audioSources: ["live-audio", "audio-file", "microphone"],
      requiredAnalysis: [],
    },
    musicContext: {
      globalBpm: true,
      globalKey: false,
      scaleSearch: false,
    },
    outputs: {
      pattern: false,
      synthScene: false,
      midi: false,
      visualScene: true,
      audio: true,
      recording: false,
    },
    exports: {
      document: "visual-scene",
      audio: {
        strategy: "source-audio",
        formats: ["wav"],
        maxDefaultDurationSec: 600,
        requiresUserGestureForPreview: true,
      },
    },
    autonomy: "assist",
    status: "enabled",
  });
  const exportName = `${toCamelCase(input.slug)}Manifest`;
  const files = new Map<string, string>([
    [`app/tools/${input.slug}/manifest.ts`, renderManifest(manifest, exportName)],
    [`app/tools/${input.slug}/page.tsx`, renderPage(input.slug, input.name)],
    [`app/tools/${input.slug}/client.tsx`, renderVisualizerClient(input.slug, input.name, input.description)],
    [`app/tools/${input.slug}/render.ts`, renderVisualizerOfflineRenderer(input.slug, input.description)],
    [`app/tools/${input.slug}/render.audio.test.ts`, renderOfflineAudioTest(input.slug, "audio-stream")],
    [`app/tools/${input.slug}/render.visual.test.ts`, renderVisualizerFrameTest(input.slug)],
    [`app/tools/${input.slug}/lib/prompt.ts`, renderVisualizerPrompt(input.slug)],
    [`app/tools/${input.slug}/__tests__/manifest.test.ts`, renderManifestTest(exportName)],
    [`app/tools/${input.slug}/client.test.tsx`, renderVisualizerClientTest(input.slug, input.name)],
    [`app/tools/${input.slug}/lib/prompt.test.ts`, renderVisualizerPromptTest(input.slug)],
  ]);

  return { manifest, files };
}

function resolveSampleSkeletonInstrument(type: NonNullable<ToolSkeletonInput["instrumentType"]>) {
  if (type !== "sample") {
    throw new Error(
      `The current L2 skeleton supports sample, synth, effect, hybrid, and visualizer instruments only; requested ${type}`,
    );
  }

  return {
    type: "sample",
    workflow: "sample-pattern",
    document: "pattern",
    usesSamples: true,
    usesSynthesis: false,
  };
}

function renderManifest(manifest: AgentManifest, exportName: string) {
  return [
    `import type { AgentManifest } from "@/lib/agents/contract";`,
    "",
    `export const ${exportName} = ${JSON.stringify(manifest, null, 2)} satisfies AgentManifest;`,
    "",
  ].join("\n");
}

function renderPage(slug: string, name: string) {
  return [
    `import { ${toPascalCase(slug)}Client } from "@/app/tools/${slug}/client";`,
    "",
    `export default function ${toPascalCase(slug)}Page() {`,
    `  return <${toPascalCase(slug)}Client />;`,
    "}",
    "",
    `export const metadata = { title: "${escapeString(name)} | toolpa" };`,
    "",
  ].join("\n");
}

function renderSampleOfflineRenderer(slug: string) {
  return [
    `import { renderPatternToAudioBuffer } from "@/lib/audio/wav-render";`,
    `import { createPattern, createStep, createTrack, PatternSchema, type Pattern } from "@/lib/pattern/schema";`,
    "",
    `const GATE_SAMPLE_ID = "${slug}-audio-gate-sample";`,
    "",
    "export const defaultDocument = createPattern({",
    `  id: "${slug}-default",`,
    `  name: "${slug} default pattern",`,
    "  bpm: 120,",
    "  bars: 1,",
    "  stepsPerBar: 16,",
    "  tracks: [",
    "    createTrack({",
    "      id: \"main\",",
    "      name: \"main\",",
    "      sampleId: GATE_SAMPLE_ID,",
    "      slot: 0,",
    "      steps: Array.from({ length: 16 }, (_, index) =>",
    "        createStep({ active: index % 4 === 0, slot: 0, velocity: 0.75 }),",
    "      ),",
    "    }),",
    "  ],",
    "});",
    "",
    "export async function renderOffline(",
    "  document: Pattern = defaultDocument,",
    "  durationSec = 1,",
    "): Promise<AudioBuffer> {",
    "  return renderPatternToAudioBuffer(PatternSchema.parse(document), {",
    "    durationSec,",
    "    sampleRate: 44100,",
    "    sliceCount: 1,",
    "  });",
    "}",
    "",
  ].join("\n");
}

function renderSynthOfflineRenderer(slug: string, description: string) {
  return [
    `import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";`,
    `import { SynthSceneSchema, type SynthScene } from "@/app/tools/evolving-fm-synth/lib/schema";`,
    `import { renderSynthSceneToAudioBuffer } from "@/lib/audio/synth-wav-render";`,
    "",
    `export const defaultDocument = createDefaultSynthScene("${escapeString(description)}");`,
    "",
    "export async function renderOffline(",
    "  document: SynthScene = defaultDocument,",
    "  durationSec = 1,",
    "): Promise<AudioBuffer> {",
    "  return renderSynthSceneToAudioBuffer(SynthSceneSchema.parse(document), {",
    "    durationSec,",
    "    sampleRate: 44100,",
    "  });",
    "}",
    "",
    `export const renderId = "${slug}:synth-scene";`,
    "",
  ].join("\n");
}

function renderEffectOfflineRenderer(slug: string) {
  return [
    "export type EffectPatchDocument = {",
    "  apiVersion: \"1.0\";",
    "  drive: number;",
    "  filterHz: number;",
    "  mix: number;",
    "};",
    "",
    "export const defaultDocument: EffectPatchDocument = {",
    "  apiVersion: \"1.0\",",
    "  drive: 1.8,",
    "  filterHz: 1800,",
    "  mix: 0.5,",
    "};",
    "",
    "export async function renderOffline(",
    "  document: EffectPatchDocument = defaultDocument,",
    "  durationSec = 1,",
    "): Promise<AudioBuffer> {",
    "  if (typeof OfflineAudioContext === \"undefined\") {",
    "    throw new Error(\"OfflineAudioContext is required for the generated effect audio gate\");",
    "  }",
    "",
    "  const sampleRate = 44100;",
    "  const context = new OfflineAudioContext(2, Math.ceil(durationSec * sampleRate), sampleRate);",
    "  const oscillator = context.createOscillator();",
    "  const inputGain = context.createGain();",
    "  const filter = context.createBiquadFilter();",
    "  const dry = context.createGain();",
    "  const wet = context.createGain();",
    "  const shaper = context.createWaveShaper();",
    "  const output = context.createDynamicsCompressor();",
    "  const mix = Math.max(0, Math.min(1, document.mix));",
    "",
    "  oscillator.type = \"sawtooth\";",
    "  oscillator.frequency.setValueAtTime(146.83, 0);",
    "  inputGain.gain.setValueAtTime(0.18, 0);",
    "  filter.type = \"lowpass\";",
    "  filter.frequency.setValueAtTime(Math.max(120, Math.min(8000, document.filterHz)), 0);",
    "  filter.Q.setValueAtTime(0.8, 0);",
    "  dry.gain.setValueAtTime(1 - mix, 0);",
    "  wet.gain.setValueAtTime(mix, 0);",
    "  shaper.curve = createDriveCurve(document.drive);",
    "  shaper.oversample = \"2x\";",
    "  output.threshold.setValueAtTime(-2, 0);",
    "  output.knee.setValueAtTime(0, 0);",
    "  output.ratio.setValueAtTime(18, 0);",
    "  output.attack.setValueAtTime(0.003, 0);",
    "  output.release.setValueAtTime(0.05, 0);",
    "",
    "  oscillator.connect(inputGain);",
    "  inputGain.connect(dry);",
    "  inputGain.connect(filter);",
    "  filter.connect(shaper);",
    "  shaper.connect(wet);",
    "  dry.connect(output);",
    "  wet.connect(output);",
    "  output.connect(context.destination);",
    "  oscillator.start(0);",
    "  oscillator.stop(durationSec);",
    "",
    "  return context.startRendering();",
    "}",
    "",
    "function createDriveCurve(drive: number): Float32Array {",
    "  const amount = Math.max(0.1, Math.min(8, drive));",
    "  const curve = new Float32Array(1024);",
    "  for (let index = 0; index < curve.length; index += 1) {",
    "    const x = (index / (curve.length - 1)) * 2 - 1;",
    "    curve[index] = Math.tanh(x * amount) * 0.8;",
    "  }",
    "  return curve;",
    "}",
    "",
    `export const renderId = "${slug}:audio-stream";`,
    "",
  ].join("\n");
}

function renderVisualizerOfflineRenderer(slug: string, description: string) {
  return [
    `import { createDefaultVisualizerScene, VisualizerSceneSchema, type VisualizerScene } from "@/lib/visualizers/schema";`,
    `import { createSilentFeatureFrame, selectAudioFeature, type AudioFeatureFrame } from "@/lib/visualizers/audio-features";`,
    "",
    `export const defaultDocument = createDefaultVisualizerScene("${escapeString(description)}");`,
    "",
    "export type VisualFrameRenderSummary = {",
    "  brightness: number;",
    "  hueShift: number;",
    "  mode: VisualizerScene[\"mode\"];",
    "  primaryDriver: number;",
    "  zoom: number;",
    "};",
    "",
    "export function renderVisualFrame(",
    "  document: VisualizerScene = defaultDocument,",
    "  frame: AudioFeatureFrame = createSilentFeatureFrame(),",
    "): VisualFrameRenderSummary {",
    "  const scene = VisualizerSceneSchema.parse(document);",
    "  const primaryDriver = selectAudioFeature(frame, scene.mapping.primaryFeature);",
    "  const secondaryDriver = selectAudioFeature(frame, scene.mapping.secondaryFeature);",
    "  const beatDriver = Math.max(frame.beat, frame.onset);",
    "  return {",
    "    brightness: clamp01(0.25 + primaryDriver * scene.mapping.sensitivity + beatDriver * 0.35),",
    "    hueShift: clamp01(secondaryDriver + frame.centroid * 0.5),",
    "    mode: scene.mode,",
    "    primaryDriver,",
    "    zoom: clamp01(0.25 + scene.motion.zoom / 4 + frame.bass * 0.35),",
    "  };",
    "}",
    "",
    "export async function renderOffline(",
    "  document: VisualizerScene = defaultDocument,",
    "  durationSec = 1,",
    "): Promise<AudioBuffer> {",
    "  if (typeof OfflineAudioContext === \"undefined\") {",
    "    throw new Error(\"OfflineAudioContext is required for the generated visualizer audio gate\");",
    "  }",
    "  const scene = VisualizerSceneSchema.parse(document);",
    "  const sampleRate = 44100;",
    "  const context = new OfflineAudioContext(2, Math.ceil(durationSec * sampleRate), sampleRate);",
    "  const oscillator = context.createOscillator();",
    "  const gain = context.createGain();",
    "  const filter = context.createBiquadFilter();",
    "  oscillator.type = \"sine\";",
    "  oscillator.frequency.setValueAtTime(110 + (scene.motion.seed % 180), 0);",
    "  gain.gain.setValueAtTime(0.18, 0);",
    "  filter.type = \"lowpass\";",
    "  filter.frequency.setValueAtTime(900 + scene.mapping.sensitivity * 900, 0);",
    "  oscillator.connect(filter);",
    "  filter.connect(gain);",
    "  gain.connect(context.destination);",
    "  oscillator.start(0);",
    "  oscillator.stop(durationSec);",
    "  return context.startRendering();",
    "}",
    "",
    `export const renderId = "${slug}:visual-scene";`,
    "",
    "function clamp01(value: number) {",
    "  if (!Number.isFinite(value)) {",
    "    return 0;",
    "  }",
    "  return Math.max(0, Math.min(1, value));",
    "}",
    "",
  ].join("\n");
}

function renderOfflineAudioTest(
  slug: string,
  documentType: "audio-stream" | "pattern" | "synth-scene",
) {
  const sampleMock =
    documentType === "pattern"
      ? [
          `const resolverMock = vi.hoisted(() => ({ resolveSample: vi.fn() }));`,
          ``,
          `vi.mock("@/lib/samples/resolver", () => ({`,
          `  resolveSample: resolverMock.resolveSample,`,
          `}));`,
          ``,
          `function makeGateSample(sampleRate = 44100): AudioBuffer {`,
          `  const context = new OfflineAudioContext(1, sampleRate, sampleRate);`,
          `  const buffer = context.createBuffer(1, sampleRate, sampleRate);`,
          `  const channel = buffer.getChannelData(0);`,
          `  for (let index = 0; index < channel.length; index += 1) {`,
          `    channel[index] = Math.sin((index / sampleRate) * Math.PI * 2 * 220) * 0.35;`,
          `  }`,
          `  return buffer;`,
          `}`,
          ``,
        ]
      : [];

  const sampleSetup =
    documentType === "pattern"
      ? [
          `    resolverMock.resolveSample.mockResolvedValue({`,
          `      audioBuffer: makeGateSample(),`,
          `      id: "${slug}-audio-gate-sample",`,
          `      name: "audio gate sample",`,
          `      origin: "library",`,
          `    });`,
        ]
      : [];

  return [
    `import { describe, expect, it, vi } from "vitest";`,
    "",
    `import { analyzeAudioBuffer } from "@/lib/audio/offline-analysis";`,
    `import { defaultDocument, renderOffline } from "./render";`,
    "",
    ...sampleMock,
    `describe("${slug} offline renderer", () => {`,
    "  it(\"produces audible, finite, unclipped audio for the L2 audio gate\", async () => {",
    ...sampleSetup,
    "",
    "    const buffer = await renderOffline(defaultDocument, 1);",
    "    const analysis = analyzeAudioBuffer(buffer, {",
    "      expectedDurationSec: 1,",
    "      maxPeak: 1.01,",
    "    });",
    "",
    "    expect(analysis.ok, analysis.reasons.join(\"\\n\")).toBe(true);",
    "    expect(analysis.rms).toBeGreaterThan(1e-4);",
    "  });",
    "});",
    "",
  ].join("\n");
}


function renderPrompt(slug: string, name: string, description: string) {
  return [
    `import type { AiSampleContext } from "@/lib/ai/sample-context";`,
    `import type { Pattern } from "@/lib/pattern/schema";`,
    "",
    `export function build${toPascalCase(slug)}SystemPrompt() {`,
    "  return [",
    `    "You are the ${escapeString(name)} L1 agent inside toolpa.",`,
    `    "${escapeString(description)}",`,
    `    "Return one valid Pattern JSON object only.",`,
    `    "Use pitchCents and tuningRef when the global scale/key should affect sample playback.",`,
    `    "Use metadata.rationale for visible decisions.",`,
    "  ].join(\"\\n\");",
    "}",
    "",
    `export function build${toPascalCase(slug)}Prompt({`,
    "  pattern,",
    "  sample,",
    "  vibe,",
    "}: {",
    "  pattern: Pattern;",
    "  sample: AiSampleContext;",
    "  vibe: string;",
    "}) {",
    "  return [",
    `    "tool: ${slug}",`,
    "    `sample: ${sample.name} (${sample.pack}, ${sample.role})`,",
    "    `vibe: ${vibe || \"make a musical generated pattern\"}`,",
    "    `current pattern: ${JSON.stringify(pattern)}`,",
    "    \"Preserve sample ids. Use tuningRef degrees for scale-aware steps and emit compact metadata.rationale.\",",
    "  ].join(\"\\n\");",
    "}",
    "",
  ].join("\n");
}

function renderSynthPrompt(slug: string, name: string, description: string) {
  return [
    `import type { SynthScene } from "@/app/tools/evolving-fm-synth/lib/schema";`,
    `import type { GlobalMusicContext } from "@/lib/music/context";`,
    "",
    `export function build${toPascalCase(slug)}SystemPrompt() {`,
    "  return [",
    `    "You are the ${escapeString(name)} L1 synth agent inside toolpa.",`,
    `    "${escapeString(description)}",`,
    `    "Return one valid SynthScene JSON object only.",`,
    `    "Preserve global BPM, swing, tonic, scale, and reference-frequency intent.",`,
    `    "Use metadata.rationale and metadata.agentPlan for visible sound-design decisions.",`,
    "  ].join(\"\\n\");",
    "}",
    "",
    `export function build${toPascalCase(slug)}Prompt({`,
    "  musicalContext,",
    "  prompt,",
    "  scene,",
    "}: {",
    "  musicalContext: GlobalMusicContext;",
    "  prompt: string;",
    "  scene: SynthScene;",
    "}) {",
    "  return [",
    `    "tool: ${slug}",`,
    "    `global context: ${musicalContext.key.tonic} ${musicalContext.key.scaleId}, ${musicalContext.bpm} bpm, swing ${musicalContext.swing}`,",
    "    `vibe: ${prompt || \"make a playable synth scene\"}`,",
    "    `current scene: ${JSON.stringify(scene)}`,",
    "    \"Keep the output playable in the browser Tone.js synth engine.\",",
    "  ].join(\"\\n\");",
    "}",
    "",
  ].join("\n");
}

function renderEffectPrompt(slug: string, name: string, description: string) {
  return [
    `import type { GlobalMusicContext } from "@/lib/music/context";`,
    "",
    `export function build${toPascalCase(slug)}SystemPrompt() {`,
    "  return [",
    `    "You are the ${escapeString(name)} L1 effect agent inside toolpa.",`,
    `    "${escapeString(description)}",`,
    `    "Return one live audio-stream effect patch plan.",`,
    `    "Model the tool as a realtime Web Audio/Tone graph: input, filter, drive, delay, output.",`,
    `    "Use bounded numeric controls and explain the patch in visible rationale text.",`,
    "  ].join(\"\\n\");",
    "}",
    "",
    `export function build${toPascalCase(slug)}Prompt({`,
    "  context,",
    "  prompt,",
    "}: {",
    "  context: GlobalMusicContext;",
    "  prompt: string;",
    "}) {",
    "  return [",
    `    "tool: ${slug}",`,
    "    `global tempo: ${context.bpm} bpm, swing ${context.swing}`,",
    "    `effect request: ${prompt || \"shape a musical audio-stream effect\"}`,",
    "    \"Keep latency low, avoid unbounded feedback, and make the patch recordable from the browser output bus.\",",
    "  ].join(\"\\n\");",
    "}",
    "",
  ].join("\n");
}

function renderHybridPrompt(slug: string, name: string, description: string) {
  return [
    `import type { SynthScene } from "@/app/tools/evolving-fm-synth/lib/schema";`,
    `import type { GlobalMusicContext } from "@/lib/music/context";`,
    `import type { AiSampleContext } from "@/lib/ai/sample-context";`,
    "",
    `export function build${toPascalCase(slug)}SystemPrompt() {`,
    "  return [",
    `    "You are the ${escapeString(name)} L1 hybrid agent inside toolpa.",`,
    `    "${escapeString(description)}",`,
    `    "Return one valid SynthScene JSON object only.",`,
    `    "Use the provided sample metadata as musical/timbral context; do not pretend full sample resynthesis exists.",`,
    `    "Use metadata.rationale and metadata.agentPlan for visible hybrid decisions.",`,
    "  ].join(\"\\n\");",
    "}",
    "",
    `export function build${toPascalCase(slug)}Prompt({`,
    "  context,",
    "  prompt,",
    "  sample,",
    "  scene,",
    "}: {",
    "  context: GlobalMusicContext;",
    "  prompt: string;",
    "  sample: AiSampleContext;",
    "  scene: SynthScene;",
    "}) {",
    "  return [",
    `    "tool: ${slug}",`,
    "    `global context: ${context.key.tonic} ${context.key.scaleId}, ${context.bpm} bpm, swing ${context.swing}`,",
    "    `source sample: ${sample.name} (${sample.pack}, ${sample.role})`,",
    "    `hybrid request: ${prompt || \"make a sample-informed synth scene\"}`,",
    "    `current scene: ${JSON.stringify(scene)}`,",
    "    \"Emit a playable SynthScene and explain how the sample influenced the patch.\",",
    "  ].join(\"\\n\");",
    "}",
    "",
  ].join("\n");
}

function renderVisualizerPrompt(slug: string) {
  return [
    `import type { VisualizerScene } from "@/lib/visualizers/schema";`,
    `import { buildAudioVisualizerPrompt, buildAudioVisualizerSystemPrompt, createVisualizerSceneFromPrompt } from "@/lib/visualizers/prompt";`,
    "",
    `export function build${toPascalCase(slug)}SystemPrompt() {`,
    "  return buildAudioVisualizerSystemPrompt();",
    "}",
    "",
    `export function build${toPascalCase(slug)}Prompt({`,
    "  prompt,",
    "  scene,",
    "}: {",
    "  prompt: string;",
    "  scene: VisualizerScene;",
    "}) {",
    "  return buildAudioVisualizerPrompt({ prompt, scene });",
    "}",
    "",
    `export function create${toPascalCase(slug)}SceneFromPrompt(prompt: string, scene?: VisualizerScene) {`,
    "  return createVisualizerSceneFromPrompt(prompt, scene);",
    "}",
    "",
  ].join("\n");
}

function renderManifestTest(exportName: string) {
  return [
    `import { describe, expect, it } from "vitest";`,
    `import { AgentManifestSchema } from "@/lib/agents/contract";`,
    `import { ${exportName} } from "../manifest";`,
    "",
    `describe("${exportName}", () => {`,
    "  it(\"matches the shared manifest schema\", () => {",
    `    expect(AgentManifestSchema.parse(${exportName})).toMatchObject({ level: 1 });`,
    "  });",
    "});",
    "",
  ].join("\n");
}

function renderClientTest(slug: string, name: string) {
  return [
    `import { render, screen } from "@testing-library/react";`,
    `import { describe, expect, it, vi } from "vitest";`,
    "",
    `import { ${toPascalCase(slug)}Client } from "./client";`,
    "",
    `vi.mock("@/components/sample-picker", () => ({`,
    `  SamplePicker: ({ label, value }: { label: string; value: string }) => (`,
    `    <label>`,
    `      {label}`,
    `      <select value={value} onChange={() => undefined}>`,
    `        <option value={value}>selected sample</option>`,
    `      </select>`,
    `    </label>`,
    `  ),`,
    `}));`,
    ``,
    `vi.mock("@/components/audio-output-recorder", () => ({`,
    `  AudioOutputRecorder: () => <button type="button">record output</button>,`,
    `}));`,
    ``,
    `vi.mock("@/lib/audio/sample-playback", () => ({`,
    `  getSamplePlaybackHost: () => ({`,
    `    playPattern: vi.fn(async () => undefined),`,
    `    updatePattern: vi.fn(async () => undefined),`,
    `    stopPattern: vi.fn(async () => undefined),`,
    `    clearPlaybackState: vi.fn(() => undefined),`,
    `    isPlaying: vi.fn(() => false),`,
    `    getEngine: vi.fn(() => ({})),`,
    `    toolId: "test",`,
    `  }),`,
    `  auditionSamplePlaybackSlice: vi.fn(async () => undefined),`,
    `}));`,
    "",
    `describe("${slug} client", () => {`,
    "  it(\"renders a usable generated instrument interface\", () => {",
    `    render(<${toPascalCase(slug)}Client />);`,
    "",
    `    expect(screen.getByText("${escapeString(name)}")).toBeInTheDocument();`,
    "    expect(screen.getByLabelText(\"source\")).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /play/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /generate/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /download wav/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /copy json/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"region\", { name: /midi playback/i })).toBeInTheDocument();",
    "    expect(screen.getByTitle(\"main step 1\")).toBeInTheDocument();",
    "  });",
    "});",
    "",
  ].join("\n");
}

function renderSynthClientTest(slug: string, name: string) {
  return [
    `import { render, screen } from "@testing-library/react";`,
    `import { describe, expect, it, vi } from "vitest";`,
    "",
    `import { ${toPascalCase(slug)}Client } from "./client";`,
    "",
    `vi.mock("@/components/audio-output-recorder", () => ({`,
    `  AudioOutputRecorder: () => <button type="button">record output</button>,`,
    `}));`,
    `vi.mock("@/app/tools/evolving-fm-synth/lib/tone-playback", () => ({`,
    `  playEvolvingFmSynthScene: vi.fn(async () => undefined),`,
    `  stopEvolvingFmSynthScene: vi.fn(async () => undefined),`,
    `}));`,
    "",
    `describe("${slug} client", () => {`,
    "  it(\"renders a usable generated synth interface\", () => {",
    `    render(<${toPascalCase(slug)}Client />);`,
    "",
    `    expect(screen.getByText("${escapeString(name)}")).toBeInTheDocument();`,
    "    expect(screen.getByLabelText(\"scene prompt\")).toBeInTheDocument();",
    "    expect(screen.getByLabelText(\"key\")).toBeInTheDocument();",
    "    expect(screen.getByLabelText(\"scale\")).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /play/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /generate/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /download wav/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /download midi/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /copy json/i })).toBeInTheDocument();",
    "    expect(screen.getByLabelText(/upload midi/i)).toBeInTheDocument();",
    "    expect(screen.getByRole(\"region\", { name: /midi playback/i })).toBeInTheDocument();",
    "    expect(screen.getByText(\"fx slots\")).toBeInTheDocument();",
    "  });",
    "});",
    "",
  ].join("\n");
}

function renderEffectClientTest(slug: string, name: string) {
  return [
    `import { render, screen } from "@testing-library/react";`,
    `import { describe, expect, it, vi } from "vitest";`,
    "",
    `import { ${toPascalCase(slug)}Client } from "./client";`,
    "",
    `vi.mock("@/components/audio-output-recorder", () => ({`,
    `  AudioOutputRecorder: () => <button type="button">record output</button>,`,
    `}));`,
    "",
    `describe("${slug} client", () => {`,
    "  it(\"renders a usable generated effect interface\", () => {",
    `    render(<${toPascalCase(slug)}Client />);`,
    "",
    `    expect(screen.getByText("${escapeString(name)}")).toBeInTheDocument();`,
    "    expect(screen.getByLabelText(\"effect prompt\")).toBeInTheDocument();",
    "    expect(screen.getByText(\"effect controls\")).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /generate patch/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /start input/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /copy json/i })).toBeInTheDocument();",
    "  });",
    "});",
    "",
  ].join("\n");
}

function renderHybridClientTest(slug: string, name: string) {
  return [
    `import { render, screen } from "@testing-library/react";`,
    `import { describe, expect, it, vi } from "vitest";`,
    "",
    `import { ${toPascalCase(slug)}Client } from "./client";`,
    "",
    `vi.mock("@/components/audio-output-recorder", () => ({`,
    `  AudioOutputRecorder: () => <button type="button">record output</button>,`,
    `}));`,
    `vi.mock("@/components/sample-picker", () => ({`,
    `  SamplePicker: ({ label, value }: { label: string; value: string }) => (`,
    `    <label>`,
    `      {label}`,
    `      <select value={value} onChange={() => undefined}>`,
    `        <option value={value}>selected sample</option>`,
    `      </select>`,
    `    </label>`,
    `  ),`,
    `}));`,
    `vi.mock("@/app/tools/evolving-fm-synth/lib/tone-playback", () => ({`,
    `  playEvolvingFmSynthScene: vi.fn(async () => undefined),`,
    `  stopEvolvingFmSynthScene: vi.fn(async () => undefined),`,
    `}));`,
    "",
    `describe("${slug} client", () => {`,
    "  it(\"renders a usable generated hybrid interface\", () => {",
    `    render(<${toPascalCase(slug)}Client />);`,
    "",
    `    expect(screen.getByText("${escapeString(name)}")).toBeInTheDocument();`,
    "    expect(screen.getByLabelText(\"source sample\")).toBeInTheDocument();",
    "    expect(screen.getByLabelText(\"hybrid prompt\")).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /play/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /generate/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /download wav/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /download midi/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /copy json/i })).toBeInTheDocument();",
    "    expect(screen.getByLabelText(/upload midi/i)).toBeInTheDocument();",
    "    expect(screen.getByRole(\"region\", { name: /midi playback/i })).toBeInTheDocument();",
    "  });",
    "});",
    "",
  ].join("\n");
}

function renderVisualizerClient(slug: string, name: string, description: string) {
  return [
    `"use client";`,
    "",
    `import { AudioVisualizerTool } from "@/components/audio-visualizer-tool";`,
    "",
    `const DEFAULT_PROMPT = "${escapeString(description)}";`,
    "",
    `export function ${toPascalCase(slug)}Client() {`,
    "  return (",
    "    <AudioVisualizerTool",
    "      defaultPrompt={DEFAULT_PROMPT}",
    `      description="${escapeString(description)}"`,
    "      manifestLabel=\"generated visualizer\"",
    `      toolName="${escapeString(name)}"`,
    `      toolSlug="${slug}"`,
    "    />",
    "  );",
    "}",
    "",
  ].join("\n");
}

function renderVisualizerClientTest(slug: string, name: string) {
  return [
    `import { render, screen } from "@testing-library/react";`,
    `import { describe, expect, it } from "vitest";`,
    "",
    `import { ${toPascalCase(slug)}Client } from "./client";`,
    "",
    `describe("${slug} client", () => {`,
    "  it(\"renders a usable generated visualizer interface\", () => {",
    `    render(<${toPascalCase(slug)}Client />);`,
    "",
    `    expect(screen.getByText("${escapeString(name)}")).toBeInTheDocument();`,
    "    expect(screen.getByLabelText(\"visualizer prompt\")).toBeInTheDocument();",
    "    expect(screen.getByText(\"recorded input\")).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /start/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /generate/i })).toBeInTheDocument();",
    "    expect(screen.getByRole(\"button\", { name: /fullscreen/i })).toBeInTheDocument();",
    "    expect(screen.getByLabelText(\"source\")).toBeInTheDocument();",
    "    expect(screen.getByRole(\"option\", { name: \"live audio\" })).toBeInTheDocument();",
    "    expect(screen.getByLabelText(\"mode\")).toBeInTheDocument();",
    "    expect(screen.getByLabelText(\"palette\")).toBeInTheDocument();",
    "  });",
    "});",
    "",
  ].join("\n");
}

function renderVisualizerPromptTest(slug: string) {
  const pascal = toPascalCase(slug);
  return [
    `import { describe, expect, it } from "vitest";`,
    `import { createDefaultVisualizerScene } from "@/lib/visualizers/schema";`,
    `import { build${pascal}Prompt, build${pascal}SystemPrompt, create${pascal}SceneFromPrompt } from "./prompt";`,
    "",
    `describe("${slug} visualizer prompt", () => {`,
    "  it(\"declares the L1 visualizer identity and VisualizerScene output contract\", () => {",
    `    const system = build${pascal}SystemPrompt();`,
    "    expect(system.length).toBeGreaterThan(180);",
    "    expect(system).toContain(\"VisualizerScene\");",
    "    expect(system).toContain(\"FFT\");",
    "  });",
    "",
    "  it(\"propagates prompt text and current scene into the request prompt\", () => {",
    "    const scene = createDefaultVisualizerScene(\"test visual\");",
    `    const prompt = build${pascal}Prompt({`,
    "      prompt: \"bass reactive prism tunnel\",",
    "      scene,",
    "    });",
    "    expect(prompt).toContain(\"bass reactive prism tunnel\");",
    "    expect(prompt).toContain(\"visual-scene\");",
    "  });",
    "",
    "  it(\"creates a bounded scene from visualizer language\", () => {",
    `    const scene = create${pascal}SceneFromPrompt("prism particle field reacting to kick bass with micro fluctuations");`,
    "    expect(scene.mode).toBe(\"particle-field\");",
    "    expect(scene.palette).toBe(\"prism\");",
    "    expect(scene.source).toBe(\"live-audio\");",
    "    expect(scene.mapping.primaryFeature).toBe(\"bass\");",
    "  });",
    "});",
    "",
  ].join("\n");
}

function renderVisualizerFrameTest(slug: string) {
  return [
    `import { describe, expect, it } from "vitest";`,
    `import { defaultDocument, renderVisualFrame } from "./render";`,
    `import type { AudioFeatureFrame } from "@/lib/visualizers/audio-features";`,
    "",
    `describe("${slug} visual frame renderer", () => {`,
    "  it(\"changes visual output when audio features change\", () => {",
    "    const quiet = renderVisualFrame(defaultDocument, makeFrame({ rms: 0.02, bass: 0.02, timestampMs: 100 }));",
    "    const loud = renderVisualFrame(defaultDocument, makeFrame({ rms: 0.8, bass: 0.8, beat: 0.9, timestampMs: 200 }));",
    "",
    "    expect(loud.brightness).toBeGreaterThan(quiet.brightness);",
    "    expect(loud.zoom).toBeGreaterThan(quiet.zoom);",
    "    expect(Number.isFinite(loud.hueShift)).toBe(true);",
    "  });",
    "});",
    "",
    "function makeFrame(patch: Partial<AudioFeatureFrame>): AudioFeatureFrame {",
    "  return {",
    "    air: 0.1,",
    "    bass: 0.1,",
    "    beat: 0,",
    "    centroid: 0.35,",
    "    flux: 0.1,",
    "    highMid: 0.1,",
    "    lowMid: 0.1,",
    "    mid: 0.1,",
    "    onset: 0,",
    "    peak: 0.1,",
    "    rms: 0.1,",
    "    sub: 0.1,",
    "    timestampMs: 0,",
    "    ...patch,",
    "  };",
    "}",
    "",
  ].join("\n");
}

function renderPromptTest(slug: string) {
  return [
    `import { describe, expect, it } from "vitest";`,
    `import { createPattern, createTrack } from "@/lib/pattern/schema";`,
    `import { build${toPascalCase(slug)}Prompt, build${toPascalCase(slug)}SystemPrompt } from "./prompt";`,
    "",
    `describe("${slug} prompt", () => {`,
    "  it(\"declares the L1 agent identity and Pattern output contract\", () => {",
    `    const system = build${toPascalCase(slug)}SystemPrompt();`,
    "    expect(system.length).toBeGreaterThan(120);",
    "    expect(system).toContain(\"toolpa\");",
    "    expect(system).toContain(\"Pattern\");",
    "  });",
    "",
    "  it(\"propagates the user vibe and sample identity into the per-request prompt\", () => {",
    "    const pattern = createPattern({",
    "      tracks: [createTrack({ id: \"track\", name: \"track\", sampleId: \"sample\" })],",
    "    });",
    `    const prompt = build${toPascalCase(slug)}Prompt({`,
    "      pattern,",
    "      sample: { id: \"sample\", name: \"Sample\", pack: \"test\", role: \"loop\", analysis: null },",
    "      vibe: \"test vibe\",",
    "    });",
    "    expect(prompt.length).toBeGreaterThan(120);",
    "    expect(prompt).toContain(\"test vibe\");",
    "    expect(prompt).toContain(\"Sample\");",
    "  });",
    "});",
    "",
  ].join("\n");
}

function renderSynthPromptTest(slug: string) {
  return [
    `import { describe, expect, it } from "vitest";`,
    `import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";`,
    `import { DEFAULT_GLOBAL_MUSIC_CONTEXT } from "@/lib/music/context";`,
    `import { build${toPascalCase(slug)}Prompt, build${toPascalCase(slug)}SystemPrompt } from "./prompt";`,
    "",
    `describe("${slug} synth prompt", () => {`,
    "  it(\"declares the L1 synth agent identity and SynthScene output contract\", () => {",
    `    const system = build${toPascalCase(slug)}SystemPrompt();`,
    "    expect(system.length).toBeGreaterThan(120);",
    "    expect(system).toContain(\"SynthScene\");",
    "  });",
    "",
    "  it(\"propagates global musical context and the user vibe into the per-request prompt\", () => {",
    "    const scene = createDefaultSynthScene(\"test synth\");",
    `    const prompt = build${toPascalCase(slug)}Prompt({`,
    "      musicalContext: DEFAULT_GLOBAL_MUSIC_CONTEXT,",
    "      prompt: \"test vibe\",",
    "      scene,",
    "    });",
    "    expect(prompt.length).toBeGreaterThan(120);",
    "    expect(prompt).toContain(\"test vibe\");",
    "    expect(prompt).toContain(String(DEFAULT_GLOBAL_MUSIC_CONTEXT.bpm));",
    "  });",
    "});",
    "",
  ].join("\n");
}

function renderEffectPromptTest(slug: string) {
  return [
    `import { describe, expect, it } from "vitest";`,
    `import { DEFAULT_GLOBAL_MUSIC_CONTEXT } from "@/lib/music/context";`,
    `import { build${toPascalCase(slug)}Prompt, build${toPascalCase(slug)}SystemPrompt } from "./prompt";`,
    "",
    `describe("${slug} effect prompt", () => {`,
    "  it(\"declares the L1 effect agent identity and audio-stream output contract\", () => {",
    `    const system = build${toPascalCase(slug)}SystemPrompt();`,
    "    expect(system.length).toBeGreaterThan(120);",
    "    expect(system).toContain(\"audio-stream\");",
    "  });",
    "",
    "  it(\"propagates the requested effect vibe and global tempo into the prompt\", () => {",
    `    const prompt = build${toPascalCase(slug)}Prompt({`,
    "      context: DEFAULT_GLOBAL_MUSIC_CONTEXT,",
    "      prompt: \"dub feedback delay\",",
    "    });",
    "    expect(prompt.length).toBeGreaterThan(80);",
    "    expect(prompt).toContain(\"dub feedback delay\");",
    "    expect(prompt).toContain(String(DEFAULT_GLOBAL_MUSIC_CONTEXT.bpm));",
    "  });",
    "});",
    "",
  ].join("\n");
}

function renderHybridPromptTest(slug: string) {
  return [
    `import { describe, expect, it } from "vitest";`,
    `import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";`,
    `import { DEFAULT_GLOBAL_MUSIC_CONTEXT } from "@/lib/music/context";`,
    `import { build${toPascalCase(slug)}Prompt, build${toPascalCase(slug)}SystemPrompt } from "./prompt";`,
    "",
    `describe("${slug} hybrid prompt", () => {`,
    "  it(\"declares the L1 hybrid agent identity and sample-as-context boundary\", () => {",
    `    const system = build${toPascalCase(slug)}SystemPrompt();`,
    "    expect(system.length).toBeGreaterThan(120);",
    "    expect(system).toContain(\"hybrid\");",
    "    expect(system).toContain(\"SynthScene\");",
    "  });",
    "",
    "  it(\"includes the sample identity, current scene, and user vibe in the prompt\", () => {",
    "    const scene = createDefaultSynthScene(\"hybrid test\");",
    `    const prompt = build${toPascalCase(slug)}Prompt({`,
    "      context: DEFAULT_GLOBAL_MUSIC_CONTEXT,",
    "      prompt: \"sample informed pad\",",
    "      sample: { id: \"sample\", name: \"Sample\", pack: \"test\", role: \"loop\", analysis: null },",
    "      scene,",
    "    });",
    "    expect(prompt.length).toBeGreaterThan(120);",
    "    expect(prompt).toContain(\"Sample\");",
    "    expect(prompt).toContain(\"sample informed pad\");",
    "  });",
    "});",
    "",
  ].join("\n");
}
