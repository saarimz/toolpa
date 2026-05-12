import type { AgentManifest } from "@/lib/agents/contract";

export const sampleBuilderManifest = {
  name: "sample-builder",
  slug: "_sample-builder",
  level: 2,
  origin: "installed",
  description:
    "Specialized L2 builder for Pattern-based sample tools with shared declicked playback and global music context.",
  route: "/build/sample",
  instrument: {
    type: "builder",
    workflow: "sample-l2-builder",
    document: "files",
    usesSamples: false,
    usesSynthesis: false,
  },
  capabilities: [
    "generateSamplePatternTool",
    "wireDeclickedSamplerEngine",
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
    audio: false,
    recording: false,
    files: true,
    manifest: true,
  },
  autonomy: "driven",
  status: "enabled",
} satisfies AgentManifest;
