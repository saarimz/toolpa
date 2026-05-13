import { describe, expect, it } from "vitest";

import {
  BuildToolRequestSchema,
  BuildToolSpecializationSchema,
} from "@/lib/agents/builder-contracts";

describe("builder contracts", () => {
  it("accepts currently supported generated-tool instrument targets", () => {
    for (const instrumentType of ["sample", "synth", "effect", "hybrid"] as const) {
      expect(
        BuildToolRequestSchema.parse({
          description: `build a ${instrumentType} instrument that is useful`,
          instrumentType,
        }).instrumentType,
      ).toBe(instrumentType);
    }
  });

  it("rejects MIDI builder requests until a MIDI L2 skeleton exists", () => {
    expect(() =>
      BuildToolRequestSchema.parse({
        description: "build a generated MIDI clip instrument",
        instrumentType: "midi",
      }),
    ).toThrow();
  });

  it("rejects MIDI builder specialization targets until the profile exists", () => {
    expect(() =>
      BuildToolSpecializationSchema.parse({
        builderSlug: "_midi-builder",
        domain: "synth",
        referenceAgent: "midi-generator",
        targetDocument: "midi-clip",
        targetInstrumentType: "midi",
        targetWorkflow: "midi-generator",
        templateKit: "midi-clip-tool-skeleton",
      }),
    ).toThrow();

    expect(() =>
      BuildToolSpecializationSchema.parse({
        builderSlug: "_sample-builder",
        domain: "sample",
        referenceAgent: "midi-generator",
        targetDocument: "midi-clip",
        targetInstrumentType: "sample",
        targetWorkflow: "midi-generator",
        templateKit: "midi-clip-tool-skeleton",
      }),
    ).toThrow();
  });
});
