import { describe, expect, it } from "vitest";

import {
  buildIntelligenceSamplerPrompt,
  buildIntelligenceSamplerSystemPrompt,
} from "@/app/tools/intelligence-sampler/lib/prompt";
import { createIntelligenceSamplerPattern } from "@/lib/pattern/defaults";

describe("intelligence sampler prompt", () => {
  it("includes sample context, current pattern, and rich step field primer", () => {
    const prompt = buildIntelligenceSamplerPrompt({
      pattern: createIntelligenceSamplerPattern(
        "library:jungle/let-there-break",
        "Let There Break",
      ),
      sample: {
        id: "library:jungle/let-there-break",
        name: "Let There Break",
        pack: "Jungle Jungle",
        role: "break",
      },
      bpm: 160,
      swing: 0.12,
      vibe: "skittery dnb pattern",
    });

    expect(prompt).toContain("Let There Break");
    expect(prompt).toContain("skittery dnb pattern");
    expect(prompt).toContain("microShift");
    expect(prompt).toContain("probability");
    expect(prompt).toContain("conditions");
    expect(prompt).toContain("chokeGroup");
    expect(prompt).toContain("metadata.rationale");
  });

  it("keeps rationale visible instead of asking for hidden reasoning", () => {
    expect(buildIntelligenceSamplerSystemPrompt()).toContain("metadata.rationale");
    expect(buildIntelligenceSamplerSystemPrompt()).toContain("selected sample role");
  });
});
