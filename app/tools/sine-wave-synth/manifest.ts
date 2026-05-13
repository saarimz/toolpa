import type { AgentManifest } from "@/lib/agents/contract";

export const sineWaveSynthManifest = {
  "name": "Sine Wave Synth",
  "slug": "sine-wave-synth",
  "level": 1,
  "origin": "generated",
  "description": "a sine wave synth with a lot of chorus",
  "route": "/tools/sine-wave-synth",
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
    "audio": true,
    "recording": true,
    "files": false,
    "manifest": false
  },
  "exports": {
    "document": "synth-scene",
    "audio": {
      "strategy": "offline-render",
      "formats": ["wav"],
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
