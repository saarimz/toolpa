import type { AgentManifest } from "@/lib/agents/contract";

export const visualizerBuilderManifest = {
  name: "visualizer-builder",
  slug: "_visualizer-builder",
  level: 2,
  origin: "installed",
  description:
    "Specialized L2 builder for audio-reactive visual-scene tools with live-audio, mic, file inputs, feature mapping, fullscreen controls, and visual frame tests.",
  route: "/build/visualizer",
  instrument: {
    type: "builder",
    workflow: "visualizer-l2-builder",
    document: "files",
    usesSamples: false,
    usesSynthesis: false,
  },
  capabilities: [
    "generateVisualizerTool",
    "wireAnalyserNodeInput",
    "mapAudioFeatures",
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
