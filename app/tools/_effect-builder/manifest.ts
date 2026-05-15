import type { AgentManifest } from "@/lib/agents/contract";

export const effectBuilderManifest = {
  name: "effect-builder",
  slug: "_effect-builder",
  level: 2,
  origin: "installed",
  description:
    "Specialized L2 builder for audio-stream effect tools with bounded patch controls, prompt overlays, and record output.",
  route: "/build/effect",
  instrument: {
    type: "builder",
    workflow: "effect-l2-builder",
    document: "files",
    usesSamples: false,
    usesSynthesis: false,
  },
  capabilities: [
    "generateEffectTool",
    "wireLiveInputPatch",
    "recordEffectOutput",
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
