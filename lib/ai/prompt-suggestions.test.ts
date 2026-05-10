import { describe, expect, it } from "vitest";

import { buildPromptSuggestionsPrompt } from "@/lib/ai/prompt-suggestions.shared";

describe("buildPromptSuggestionsPrompt", () => {
  it("anchors suggestions to the original prompt and sample context", () => {
    const prompt = buildPromptSuggestionsPrompt({
      toolSlug: "intelligence-sampler",
      prompt: "skittery dnb pattern",
      sampleName: "Let There Break",
      samplePack: "Blu Mar Ten - Jungle Jungle",
      sampleRole: "break",
      bpm: 160,
      swing: 0.1,
    });

    expect(prompt).toContain("skittery dnb pattern");
    expect(prompt).toContain("Let There Break");
    expect(prompt).toContain("Role: break");
    expect(prompt).toContain("Do not assume");
    expect(prompt).toContain("under 18 words");
    expect(prompt).toContain("audible sequencing decisions");
  });
});
