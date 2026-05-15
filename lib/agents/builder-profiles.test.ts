import { describe, expect, it } from "vitest";

import { AgentManifestSchema } from "@/lib/agents/contract";
import {
  coerceBuilderProfileDomain,
  createBuilderProfilePlan,
  getBuilderProfileDomains,
} from "@/lib/agents/builder-profiles";

describe("builder profiles", () => {
  it("lists the specialized L2 builder domains deterministically", () => {
    expect(getBuilderProfileDomains()).toEqual([
      "sample",
      "synth",
      "effect",
      "hybrid",
      "microtonal",
      "visualizer",
    ]);
  });

  it("drafts a valid synth L2 builder manifest and handoff prompt", () => {
    const plan = createBuilderProfilePlan({
      description: "Build rich wavetable synth builders.",
      domain: "synth",
    });

    expect(AgentManifestSchema.parse(plan.builderManifest)).toMatchObject({
      slug: "_synth-builder",
      level: 2,
      instrument: {
        type: "builder",
        document: "files",
      },
      route: "/build/synth",
    });
    expect(plan.target).toMatchObject({
      document: "synth-scene",
      instrumentType: "synth",
      workflow: "synth-scene",
    });
    expect(plan.handoffPrompt).toContain("evolving-fm-synth");
    expect(plan.handoffPrompt).toContain("synth-scene-tool-skeleton");
  });

  it("plans microtonal sample builders around pitchCents and tuningRef", () => {
    const plan = createBuilderProfilePlan({
      description: "Build xenharmonic samplers.",
      domain: "microtonal",
    });

    expect(plan.builderManifest.slug).toBe("_microtonal-builder");
    expect(plan.target).toMatchObject({
      document: "pattern",
      instrumentType: "sample",
      workflow: "microtonal-sample-pattern",
    });
    expect(plan.constraints.join(" ")).toContain("pitchSemitones");
    expect(plan.verificationGates.join(" ")).toContain("pitchCents");
    expect(plan.verificationGates.join(" ")).toContain("tuningRef");
  });

  it("plans visualizer builders around audio feature mapping", () => {
    const plan = createBuilderProfilePlan({
      description: "Build VJ tools that react to live audio, microphone, and recorded input.",
      domain: "visualizer",
    });

    expect(plan.builderManifest.slug).toBe("_visualizer-builder");
    expect(plan.builderManifest.route).toBe("/build/visualizer");
    expect(plan.target).toMatchObject({
      document: "visual-scene",
      instrumentType: "visualizer",
      workflow: "audio-reactive-visual-scene",
    });
    expect(plan.referenceAgent).toBe("audio-visualizer");
    expect(plan.verificationGates.join(" ")).toContain("VisualizerSceneSchema");
    expect(plan.constraints.join(" ")).toContain("Microphone input");
  });

  it("coerces missing or unknown domains to the synth builder path", () => {
    expect(coerceBuilderProfileDomain(undefined)).toBe("synth");
    expect(coerceBuilderProfileDomain("unknown")).toBe("synth");
    expect(createBuilderProfilePlan({ domain: "unknown" }).builderManifest.slug).toBe(
      "_synth-builder",
    );
  });
});
