import type { AgentManifest } from "@/lib/agents/contract";

export const vocalLikeSoundManifest = {
  "name": "Vocal Like Sound",
  "slug": "vocal-like-sound",
  "level": 1,
  "origin": "generated",
  "description": "a tool that takes a vocal like sound and stutters it with probabilistic repeats",
  "route": "/tools/vocal-like-sound",
  "instrument": {
    "type": "synth",
    "workflow": "synth-scene",
    "document": "synth-scene",
    "usesSamples": false,
    "usesSynthesis": true
  },
  "capabilities": [
    "generateSynthScene",
    "play",
    "exportMidi",
    "fxSlots",
    "recordOutput"
  ],
  "inputs": {
    "samples": [],
    "bpm": true,
    "globalBpm": true,
    "globalKey": true,
    "scaleSearch": true,
    "prompt": true,
    "description": false,
    "referenceAgent": false,
    "audioSources": [],
    "requiredAnalysis": []
  },
  "musicContext": {
    "globalBpm": true,
    "globalKey": true,
    "scaleSearch": true
  },
  "outputs": {
    "pattern": false,
    "synthScene": true,
    "midi": true,
    "visualScene": false,
    "audio": true,
    "recording": true,
    "files": false,
    "manifest": false
  },
  "exports": {
    "document": "synth-scene",
    "audio": {
      "strategy": "offline-render",
      "formats": [
        "wav"
      ],
      "maxDefaultDurationSec": 600,
      "requiresUserGestureForPreview": true
    },
    "midi": {
      "strategy": "standard-midi-file",
      "format": "smf-1",
      "ticksPerQuarter": 480,
      "preservesTracks": true,
      "supportsPitchBend": true,
      "supportsCc": false
    }
  },
  "fx": {
    "enabled": true
  },
  "autonomy": "assist",
  "status": "enabled"
} satisfies AgentManifest;
