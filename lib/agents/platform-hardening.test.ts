import { describe, expect, it } from "vitest";

import {
  createPlatformHardeningAudit,
  WEB_AUDIO_REFERENCE_CONVENTIONS,
} from "@/lib/agents/platform-hardening";
import { getAgentManifests } from "@/lib/agents/registry";
import type { AgentManifest } from "@/lib/agents/contract";

describe("platform hardening audit", () => {
  it("keeps the shipped L1/L2 suite aligned with reference web-audio conventions", () => {
    const manifests = getAgentManifests();
    const l1Count = manifests.filter((manifest) => manifest.level === 1).length;
    const l2Count = manifests.filter((manifest) => manifest.level === 2).length;
    const audit = createPlatformHardeningAudit(manifests);

    expect(audit).toMatchObject({
      l1Count,
      l2Count,
      specializedBuilderCount: 5,
      status: "ready",
      summary: `${l1Count} L1 tools and ${l2Count} L2 builders pass platform hardening gates.`,
    });
    expect(audit.issues).toEqual([]);
    expect(WEB_AUDIO_REFERENCE_CONVENTIONS.map((rule) => rule.id)).toEqual([
      "serializable-audio-documents",
      "explicit-audio-ui-boundary",
      "bounded-playable-synthesis",
      "builder-generated-tool-gates",
      "prompt-first-control-order",
    ]);
  });

  it("flags L1s that hide document output or describe builder tasks", () => {
    const weakL1: AgentManifest = {
      ...validL1,
      description: "Build a builder for pads.",
      outputs: {
        ...validL1.outputs,
        pattern: false,
        recording: false,
      },
      capabilities: ["generatePattern"],
    };
    const audit = createPlatformHardeningAudit([weakL1]);

    expect(audit.status).toBe("attention");
    expect(audit.issues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining([
        "weak-pattern:l1-document-output",
        "weak-pattern:l1-recording",
        "weak-pattern:l1-description",
      ]),
    );
  });

  it("requires MIDI export for discrete SynthScene L1s but not continuous live synths", () => {
    const weakSynth: AgentManifest = {
      ...validL1,
      capabilities: ["generateSynthScene", "play", "recordOutput"],
      instrument: {
        document: "synth-scene",
        type: "synth",
        usesSamples: false,
        usesSynthesis: true,
        workflow: "synth-scene",
      },
      outputs: {
        ...validL1.outputs,
        pattern: false,
        synthScene: true,
      },
      exports: {
        document: "synth-scene",
        audio: {
          strategy: "offline-render",
          formats: ["wav"],
          maxDefaultDurationSec: 120,
          requiresUserGestureForPreview: true,
        },
      },
      route: "/tools/weak-synth",
      slug: "weak-synth",
    };
    const liveSynth: AgentManifest = {
      ...weakSynth,
      capabilities: ["cameraTracking", "continuousSynth", "recordOutput"],
      exports: {
        document: "synth-scene",
        audio: {
          strategy: "live-recording",
          formats: ["wav"],
          maxDefaultDurationSec: 120,
          requiresUserGestureForPreview: true,
        },
      },
      route: "/tools/live-synth",
      slug: "live-synth",
    };

    const weakAudit = createPlatformHardeningAudit([weakSynth]);
    const liveAudit = createPlatformHardeningAudit([liveSynth]);

    expect(weakAudit.issues.map((issue) => issue.id)).toContain(
      "weak-synth:l1-midi-export",
    );
    expect(liveAudit.issues.map((issue) => issue.id)).not.toContain(
      "live-synth:l1-midi-export",
    );
  });

  it("flags L2 builders that cannot verify and register generated tools", () => {
    const weakL2: AgentManifest = {
      ...validL2,
      capabilities: ["generateTool"],
      outputs: {
        ...validL2.outputs,
        manifest: false,
      },
    };
    const audit = createPlatformHardeningAudit([weakL2]);

    expect(audit.status).toBe("attention");
    expect(audit.issues.map((issue) => issue.id)).toEqual(
      expect.arrayContaining([
        "_weak-builder:l2-outputs",
        "_weak-builder:l2-verifyTool",
        "_weak-builder:l2-registerTool",
      ]),
    );
  });
});

const validL1: AgentManifest = {
  autonomy: "assist",
  capabilities: ["generatePattern", "play", "recordOutput"],
  description: "Playable prompt-first pattern instrument.",
  inputs: {
    bpm: true,
    description: false,
    globalBpm: true,
    globalKey: true,
    prompt: true,
    referenceAgent: false,
    requiredAnalysis: [],
    samples: ["break"],
    scaleSearch: true,
  },
  instrument: {
    document: "pattern",
    type: "sample",
    usesSamples: true,
    usesSynthesis: false,
    workflow: "sample-pattern",
  },
  level: 1,
  musicContext: {
    globalBpm: true,
    globalKey: true,
    scaleSearch: true,
  },
  name: "Weak Pattern",
  origin: "generated",
  outputs: {
    audio: true,
    files: false,
    manifest: false,
    midi: false,
    pattern: true,
    recording: true,
    synthScene: false,
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
  route: "/tools/weak-pattern",
  slug: "weak-pattern",
  status: "enabled",
};

const validL2: AgentManifest = {
  autonomy: "driven",
  capabilities: ["generateTool", "verifyTool", "registerTool"],
  description: "Builds generated L1 files.",
  inputs: {
    bpm: false,
    description: true,
    globalBpm: false,
    globalKey: false,
    prompt: false,
    referenceAgent: true,
    requiredAnalysis: [],
    samples: [],
    scaleSearch: false,
  },
  instrument: {
    document: "files",
    type: "builder",
    usesSamples: false,
    usesSynthesis: false,
    workflow: "weak-l2-builder",
  },
  level: 2,
  musicContext: {
    globalBpm: false,
    globalKey: false,
    scaleSearch: false,
  },
  name: "weak-builder",
  origin: "installed",
  outputs: {
    audio: false,
    files: true,
    manifest: true,
    midi: false,
    pattern: false,
    recording: false,
    synthScene: false,
  },
  route: "/build/weak",
  slug: "_weak-builder",
  status: "enabled",
};
