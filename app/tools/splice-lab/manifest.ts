import type { AgentManifest } from "@/lib/agents/contract";

export const spliceLabManifest: AgentManifest = {
  name: "splice lab",
  slug: "splice-lab",
  level: 1,
  origin: "installed",
  description: "Interleave two to ten loaded sources into rhythmic sample-splice loops.",
  route: "/tools/splice-lab",
  instrument: {
    type: "sample",
    workflow: "sample-splicer",
    document: "pattern",
    usesSamples: true,
    usesSynthesis: false,
  },
  capabilities: ["selectSources", "mapSplices", "generatePattern", "play", "render", "recordOutput"],
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
