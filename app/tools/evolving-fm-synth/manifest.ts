import type { AgentManifest } from "@/lib/agents/contract";

export const evolvingFmSynthManifest = {
  name: "Evolving FM Synth",
  slug: "evolving-fm-synth",
  level: 1,
  origin: "installed",
  description:
    "Hybrid wavetable/FM synth with prompt-generated MIDI, timbre, variation, and dub effects.",
  route: "/tools/evolving-fm-synth",
  instrument: {
    type: "synth",
    workflow: "synth-scene",
    document: "synth-scene",
    usesSamples: false,
    usesSynthesis: true,
  },
  capabilities: [
    "promptToPatch",
    "wavetableFm",
    "generateMidi",
    "evolveVariations",
    "dubEffects",
    "recordOutput",
  ],
  inputs: {
    samples: [],
    bpm: true,
    globalBpm: true,
    globalKey: true,
    scaleSearch: true,
    prompt: true,
    description: false,
    referenceAgent: false,
    requiredAnalysis: [],
  },
  musicContext: {
    globalBpm: true,
    globalKey: true,
    scaleSearch: true,
  },
  outputs: {
    pattern: false,
    synthScene: true,
    audio: true,
    recording: true,
    files: false,
    manifest: false,
  },
  autonomy: "driven",
  status: "enabled",
} satisfies AgentManifest;
