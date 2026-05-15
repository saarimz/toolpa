import type { AgentManifest } from "@/lib/agents/contract";

export const microtonalBuilderManifest = {
  name: "microtonal-builder",
  slug: "_microtonal-builder",
  level: 2,
  origin: "installed",
  description:
    "Specialized L2 builder for microtonal sample tools with scale search, pitchCents, tuningRef, and shared declicked playback.",
  route: "/build/microtonal",
  instrument: {
    type: "builder",
    workflow: "microtonal-l2-builder",
    document: "files",
    usesSamples: false,
    usesSynthesis: false,
  },
  capabilities: [
    "generateMicrotonalPatternTool",
    "wireScaleSearch",
    "resolveTuningRef",
    "verifyTool",
    "registerTool",
  ],
  inputs: {
    samples: [],
    bpm: false,
    globalBpm: false,
    globalKey: false,
    scaleSearch: false,
    prompt: false,
    description: true,
    referenceAgent: true,
    audioSources: [],
    requiredAnalysis: [],
  },
  musicContext: {
    globalBpm: false,
    globalKey: false,
    scaleSearch: false,
  },
  outputs: {
    pattern: false,
    synthScene: false,
    midi: false,
    visualScene: false,
    audio: false,
    recording: false,
    files: true,
    manifest: true,
  },
  autonomy: "driven",
  status: "enabled",
} satisfies AgentManifest;
