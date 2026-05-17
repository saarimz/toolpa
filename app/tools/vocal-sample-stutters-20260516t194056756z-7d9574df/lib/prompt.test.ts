import { describe, expect, it } from "vitest";
import { createPattern, createTrack } from "@/lib/pattern/schema";
import { buildVocalSampleStutters20260516t194056756z7d9574dfPrompt, buildVocalSampleStutters20260516t194056756z7d9574dfSystemPrompt } from "./prompt";

describe("vocal-sample-stutters-20260516t194056756z-7d9574df prompt", () => {
  it("declares the L1 agent identity and Pattern output contract", () => {
    const system = buildVocalSampleStutters20260516t194056756z7d9574dfSystemPrompt();
    expect(system.length).toBeGreaterThan(120);
    expect(system).toContain("toolpa");
    expect(system).toContain("Pattern");
  });

  it("propagates the user vibe and sample identity into the per-request prompt", () => {
    const pattern = createPattern({
      tracks: [createTrack({ id: "track", name: "track", sampleId: "sample" })],
    });
    const prompt = buildVocalSampleStutters20260516t194056756z7d9574dfPrompt({
      pattern,
      sample: { id: "sample", name: "Sample", pack: "test", role: "loop", analysis: null },
      vibe: "test vibe",
    });
    expect(prompt.length).toBeGreaterThan(120);
    expect(prompt).toContain("test vibe");
    expect(prompt).toContain("Sample");
  });
});
