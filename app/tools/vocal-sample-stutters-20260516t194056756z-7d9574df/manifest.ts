import type { AgentManifest } from "@/lib/agents/contract";

export const vocalSampleStutters20260516t194056756z7d9574dfManifest = {
  "name": "Vocal Sample Stutters 20260516T194056756Z-7d9574df",
  "slug": "vocal-sample-stutters-20260516t194056756z-7d9574df",
  "level": 1,
  "origin": "generated",
  "description": "a tool that takes a vocal sample and stutters it with probabilistic repeats",
  "route": "/tools/vocal-sample-stutters-20260516t194056756z-7d9574df",
  "instrument": {
    "type": "sample",
    "workflow": "sample-pattern",
    "document": "pattern",
    "usesSamples": true,
    "usesSynthesis": false
  },
  "capabilities": [
    "generatePattern",
    "play",
    "recordOutput"
  ],
  "inputs": {
    "samples": [
      "loop",
      "oneshot",
      "melodic",
      "pad",
      "fx"
    ],
    "bpm": true,
    "globalBpm": true,
    "globalKey": true,
    "scaleSearch": true,
    "prompt": true,
    "description": false,
    "referenceAgent": false,
    "audioSources": [],
    "requiredAnalysis": [
      "global.true_peak_dbfs",
      "rhythm.onsets_s",
      "envelope.attack_ms",
      "slices"
    ]
  },
  "musicContext": {
    "globalBpm": true,
    "globalKey": true,
    "scaleSearch": true
  },
  "outputs": {
    "pattern": true,
    "synthScene": false,
    "midi": false,
    "visualScene": false,
    "audio": true,
    "recording": true,
    "files": false,
    "manifest": false
  },
  "exports": {
    "document": "pattern",
    "audio": {
      "strategy": "offline-render",
      "formats": [
        "wav"
      ],
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
