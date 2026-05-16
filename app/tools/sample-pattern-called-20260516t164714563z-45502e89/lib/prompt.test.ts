import { describe, expect, it } from "vitest";
import { createPattern, createTrack } from "@/lib/pattern/schema";
import { buildSamplePatternCalled20260516t164714563z45502e89Prompt, buildSamplePatternCalled20260516t164714563z45502e89SystemPrompt } from "./prompt";

describe("sample-pattern-called-20260516t164714563z-45502e89 prompt", () => {
  it("declares the L1 agent identity and Pattern output contract", () => {
    const system = buildSamplePatternCalled20260516t164714563z45502e89SystemPrompt();
    expect(system.length).toBeGreaterThan(120);
    expect(system).toContain("toolpa");
    expect(system).toContain("Pattern");
  });

  it("propagates the user vibe and sample identity into the per-request prompt", () => {
    const pattern = createPattern({
      tracks: [createTrack({ id: "track", name: "track", sampleId: "sample" })],
    });
    const prompt = buildSamplePatternCalled20260516t164714563z45502e89Prompt({
      pattern,
      sample: { id: "sample", name: "Sample", pack: "test", role: "loop", analysis: null },
      vibe: "test vibe",
    });
    expect(prompt.length).toBeGreaterThan(120);
    expect(prompt).toContain("test vibe");
    expect(prompt).toContain("Sample");
  });
});
