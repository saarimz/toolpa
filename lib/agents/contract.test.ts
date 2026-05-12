import { describe, expect, it } from "vitest";

import { AgentManifestSchema } from "@/lib/agents/contract";

describe("AgentManifestSchema", () => {
  it("defaults inputs and autonomy", () => {
    expect(
      AgentManifestSchema.parse({
        name: "tool",
        slug: "tool",
        level: 1,
        description: "test",
        route: "/tools/tool",
        outputs: { pattern: true, audio: false },
      }),
    ).toMatchObject({
      autonomy: "manual",
      origin: "installed",
      status: "enabled",
      instrument: {
        type: "sample",
        workflow: "sample-pattern",
        document: "pattern",
        usesSamples: true,
        usesSynthesis: false,
      },
      inputs: {
        samples: [],
        bpm: true,
        globalBpm: false,
        globalKey: false,
        scaleSearch: false,
        prompt: true,
        description: false,
        referenceAgent: false,
      },
      musicContext: {
        globalBpm: false,
        globalKey: false,
        scaleSearch: false,
      },
      outputs: {
        pattern: true,
        synthScene: false,
        midi: false,
        audio: false,
        recording: false,
        files: false,
        manifest: false,
      },
    });
  });

  it("accepts L2 builder manifests", () => {
    expect(
      AgentManifestSchema.parse({
        name: "tool-builder",
        slug: "_builder",
        level: 2,
        origin: "installed",
        description: "Builds L1 tools",
        route: "/build",
        instrument: {
          type: "builder",
          workflow: "tool-builder",
          document: "files",
          usesSamples: false,
          usesSynthesis: false,
        },
        inputs: { description: true, referenceAgent: true },
        outputs: { files: true, manifest: true },
        autonomy: "driven",
      }),
    ).toMatchObject({
      level: 2,
      origin: "installed",
      instrument: {
        type: "builder",
        workflow: "tool-builder",
        document: "files",
        usesSamples: false,
        usesSynthesis: false,
      },
      inputs: { description: true, referenceAgent: true },
      musicContext: { globalBpm: false, globalKey: false, scaleSearch: false },
      outputs: {
        pattern: false,
        synthScene: false,
        midi: false,
        audio: false,
        recording: false,
        files: true,
        manifest: true,
      },
    });
  });

  it("rejects builder levels outside the L1/L2 product model", () => {
    expect(() =>
      AgentManifestSchema.parse({
        name: "agent-builder",
        slug: "agent-builder",
        level: 3,
        description: "Builds higher-level agents",
        route: "/build/agent",
      }),
    ).toThrow();
  });

  it("accepts generated manifest origin tags", () => {
    expect(
      AgentManifestSchema.parse({
        name: "generated tool",
        slug: "generated-tool",
        level: 1,
        origin: "generated",
        description: "AI-generated tool",
        route: "/tools/generated-tool",
        outputs: { pattern: true, audio: true },
      }).origin,
    ).toBe("generated");
  });

  it("rejects non-route paths and invalid slugs", () => {
    expect(() =>
      AgentManifestSchema.parse({
        name: "tool",
        slug: "Bad Slug",
        level: 1,
        description: "test",
        route: "tools/tool",
        outputs: { pattern: true, audio: false },
      }),
    ).toThrow();
  });

  it("accepts every bundled sample role in tool manifests", () => {
    expect(
      AgentManifestSchema.parse({
        name: "tool",
        slug: "tool",
        level: 1,
        description: "test",
        route: "/tools/tool",
        inputs: {
          samples: ["break", "loop", "oneshot", "melodic", "pad", "fx"],
        },
        outputs: { pattern: true, audio: false },
      }).inputs.samples,
    ).toEqual(["break", "loop", "oneshot", "melodic", "pad", "fx"]);
  });

  it("models global BPM/key context consumption for L1 synths and samplers", () => {
    expect(
      AgentManifestSchema.parse({
        name: "synth",
        slug: "synth",
        level: 1,
        description: "synth",
        route: "/tools/synth",
        instrument: {
          type: "synth",
          workflow: "synth-scene",
          document: "synth-scene",
          usesSamples: false,
          usesSynthesis: true,
        },
        inputs: { globalBpm: true, globalKey: true, scaleSearch: true },
        musicContext: { globalBpm: true, globalKey: true, scaleSearch: true },
        capabilities: ["recordOutput"],
        outputs: { synthScene: true, midi: true, audio: true, recording: true },
      }),
    ).toMatchObject({
      instrument: {
        type: "synth",
        workflow: "synth-scene",
        document: "synth-scene",
        usesSamples: false,
        usesSynthesis: true,
      },
      musicContext: { globalBpm: true, globalKey: true, scaleSearch: true },
      outputs: { pattern: false, synthScene: true, midi: true, recording: true },
      capabilities: ["recordOutput"],
    });
  });
});
