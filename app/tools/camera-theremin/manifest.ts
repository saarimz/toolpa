import type { AgentManifest } from "@/lib/agents/contract";

export const cameraThereminManifest = {
  name: "Camera Theremin",
  slug: "camera-theremin",
  level: 1,
  origin: "installed",
  description:
    "Camera-tracked hand synth that quantizes theremin-style motion into the selected key and scale.",
  route: "/tools/camera-theremin",
  instrument: {
    type: "synth",
    workflow: "camera-theremin",
    document: "synth-scene",
    usesSamples: false,
    usesSynthesis: true,
  },
  capabilities: [
    "cameraTracking",
    "handLandmarks",
    "scaleQuantizedPitch",
    "continuousSynth",
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
    midi: false,
    audio: true,
    recording: true,
    files: false,
    manifest: false,
  },
  autonomy: "manual",
  status: "enabled",
} satisfies AgentManifest;
