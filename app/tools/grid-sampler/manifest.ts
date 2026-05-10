import type { AgentManifest } from "@/lib/agents/contract";

export const gridSamplerManifest: AgentManifest = {
  name: "grid sampler",
  slug: "grid-sampler",
  level: 1,
  origin: "installed",
  description: "Traverse dense 2D slice maps with deterministic direction modes.",
  route: "/tools/grid-sampler",
  instrument: {
    type: "sample",
    workflow: "sample-grid",
    document: "pattern",
    usesSamples: true,
    usesSynthesis: false,
  },
  capabilities: ["sliceGrid", "traverse", "generatePattern", "recordOutput"],
  inputs: {
    samples: ["break", "loop", "oneshot", "melodic", "pad", "fx"],
    bpm: true,
    globalBpm: true,
    globalKey: true,
    scaleSearch: true,
    prompt: true,
    description: false,
    referenceAgent: false,
    requiredAnalysis: ["global.true_peak_dbfs", "rhythm.onsets_s", "envelope.attack_ms", "slices"],
  },
  musicContext: {
    globalBpm: true,
    globalKey: true,
    scaleSearch: true,
  },
  outputs: {
    pattern: true,
    synthScene: false,
    audio: true,
    recording: true,
    files: false,
    manifest: false,
  },
  autonomy: "assist",
  status: "enabled",
};
