import type { AgentManifest } from "@/lib/agents/contract";

export const intelligenceSamplerManifest: AgentManifest = {
  name: "intelligence sampler",
  slug: "intelligence-sampler",
  level: 1,
  origin: "installed",
  description: "Slice any source into eight playable slots with AI-assisted patterning.",
  route: "/tools/intelligence-sampler",
  instrument: {
    type: "sample",
    workflow: "sample-slicer",
    document: "pattern",
    usesSamples: true,
    usesSynthesis: false,
  },
  capabilities: ["slice", "generatePattern", "play", "share", "fxSlots", "recordOutput"],
  inputs: {
    samples: ["loop", "pad", "melodic", "fx", "oneshot", "break"],
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
    midi: false,
    audio: true,
    recording: true,
    files: false,
    manifest: false,
  },
  exports: {
    document: "pattern",
    audio: {
      strategy: "offline-render",
      formats: ["wav"],
      maxDefaultDurationSec: 120,
      requiresUserGestureForPreview: true,
    },
  },
  fx: {
    enabled: true,
  },
  autonomy: "assist",
  status: "enabled",
};
