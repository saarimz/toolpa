import type { AgentManifest } from "@/lib/agents/contract";

export const samplePatternCalled20260516t164714563z45502e89Manifest = {
  "name": "Sample Pattern Called 20260516T164714563Z-45502e89",
  "slug": "sample-pattern-called-20260516t164714563z-45502e89",
  "level": 1,
  "origin": "generated",
  "description": "  Build an L1 sample-pattern tool called Timbre Orbit Sampler.\n\n  It uses 1-4 source samples. The tool slices each source into candidate hits, places slices on a 2D timbre map using existing sample/waveform/analysis features, and generates\n  PatternSchema output by moving a seeded orbit playhead through attractor fields.\n\n  The UI should include SamplePicker, a prompt box, global BPM/key/scale controls, an orbit/timbre-map canvas, density/mutation/gravity controls, pattern live trace, FX slots,\n  recording, WAV/export, and JSON pattern export.\n\n  Do not implement spectral resynthesis, AI audio generation, or a custom scheduler. Use the shared sample engine and PatternSchema only. Map orbit hits into track steps using\n  sampleId/slot, velocity, probability, microShift, pitchSemitones, optional pitchCents, playbackRate, decay, reverse, repeats, and everyN/firstOfN/notFirstOfN conditions.\n\n  Include deterministic local fallback generation, schema validation tests, prompt-generation tests, and an audible offline render gate.\n\n",
  "route": "/tools/sample-pattern-called-20260516t164714563z-45502e89",
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
