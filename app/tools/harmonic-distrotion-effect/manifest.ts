import type { AgentManifest } from "@/lib/agents/contract";

export const harmonicDistrotionEffectManifest = {
  "name": "Harmonic Distrotion Effect",
  "slug": "harmonic-distrotion-effect",
  "level": 1,
  "origin": "generated",
  "description": "create a harmonic distrotion effect that is not super harsh",
  "route": "/tools/harmonic-distrotion-effect",
  "instrument": {
    "type": "effect",
    "workflow": "audio-stream-effect",
    "document": "audio-stream",
    "usesSamples": false,
    "usesSynthesis": false
  },
  "capabilities": [
    "promptToEffectPatch",
    "liveInputEffect",
    "recordOutput"
  ],
  "inputs": {
    "samples": [],
    "bpm": true,
    "globalBpm": true,
    "globalKey": false,
    "scaleSearch": false,
    "prompt": true,
    "description": false,
    "referenceAgent": false,
    "audioSources": [],
    "requiredAnalysis": []
  },
  "musicContext": {
    "globalBpm": true,
    "globalKey": false,
    "scaleSearch": false
  },
  "outputs": {
    "pattern": false,
    "synthScene": false,
    "midi": false,
    "visualScene": false,
    "audio": true,
    "recording": true,
    "files": false,
    "manifest": false
  },
  "exports": {
    "document": "audio-stream",
    "audio": {
      "strategy": "offline-render",
      "formats": ["wav"],
      "maxDefaultDurationSec": 120,
      "requiresUserGestureForPreview": true
    }
  },
  "fx": {
    "enabled": false
  },
  "autonomy": "assist",
  "status": "enabled"
} satisfies AgentManifest;
