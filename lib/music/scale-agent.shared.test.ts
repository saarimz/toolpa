import { describe, expect, it } from "vitest";

import {
  buildScaleAgentPrompt,
  createDeterministicScaleChoice,
  getScaleAgentCandidates,
} from "@/lib/music/scale-agent.shared";

describe("scale agent shared helpers", () => {
  it("builds a candidate shortlist from prompt text", () => {
    const candidates = getScaleAgentCandidates({
      prompt: "microtonal quarter tone ritual pads",
      tonic: "C",
      limit: 8,
    });

    expect(candidates.length).toBeGreaterThanOrEqual(3);
    expect(candidates.some((candidate) => candidate.scale.microtonal)).toBe(true);
    expect(candidates.every((candidate) => candidate.tonic === "C")).toBe(true);
  });

  it("builds a prompt constrained to candidate scale ids", () => {
    const candidates = getScaleAgentCandidates({
      prompt: "persian dark club pressure",
      tonic: "A",
      limit: 4,
    });
    const prompt = buildScaleAgentPrompt(
      { prompt: "persian dark club pressure", tonic: "A", limit: 4 },
      candidates,
    );

    expect(prompt).toContain("Candidate keys and scales");
    expect(prompt).toContain("Use only candidate scale ids");
    expect(prompt).toContain(candidates[0]?.scale.id);
  });

  it("creates a deterministic fallback choice with alternatives", () => {
    const choice = createDeterministicScaleChoice({
      prompt: "gamelan metallic stutter",
      tonic: "F#",
      limit: 6,
    });

    expect(choice.selected.tonic).toBe("F#");
    expect(choice.selected.rationale).toContain("Matched");
    expect(choice.alternatives.length).toBeGreaterThan(0);
  });
});
