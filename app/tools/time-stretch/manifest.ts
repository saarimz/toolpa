import type { AgentManifest } from "@/lib/agents/contract";

export const timeStretchManifest = {
  name: "time stretch",
  slug: "time-stretch",
  level: 1,
  origin: "installed",
  description:
    "Stretch uploaded or library audio to exact bar lengths with transparent, rhythmic, ambient, freeze, granular, and subharmonic modes.",
  route: "/tools/time-stretch",
  instrument: {
    type: "hybrid",
    workflow: "time-stretch-audio",
    document: "audio-stream",
    usesSamples: true,
    usesSynthesis: true,
  },
  capabilities: [
    "selectSample",
    "uploadSample",
    "stretchToBars",
    "promptToStretchPatch",
    "spectralFreeze",
    "subharmonicBloom",
    "render",
    "recordOutput",
  ],
  inputs: {
    samples: ["break", "loop", "oneshot", "melodic", "pad", "fx"],
    bpm: true,
    globalBpm: true,
    globalKey: true,
    scaleSearch: true,
    prompt: true,
    description: false,
    referenceAgent: false,
    audioSources: [],
    requiredAnalysis: [
      "global.true_peak_dbfs",
      "rhythm.onsets_s",
      "envelope.attack_ms",
      "slices",
    ],
  },
  musicContext: {
    globalBpm: true,
    globalKey: true,
    scaleSearch: true,
  },
  outputs: {
    pattern: false,
    synthScene: false,
    midi: false,
    visualScene: false,
    audio: true,
    recording: true,
    files: true,
    manifest: false,
  },
  exports: {
    document: "audio-stream",
    audio: {
      strategy: "offline-render",
      formats: ["wav"],
      maxDefaultDurationSec: 240,
      requiresUserGestureForPreview: true,
    },
  },
  fx: {
    enabled: true,
  },
  autonomy: "assist",
  status: "enabled",
} satisfies AgentManifest;
