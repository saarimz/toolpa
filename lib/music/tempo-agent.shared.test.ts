import { describe, expect, it } from "vitest";

import {
  buildTempoAgentPrompt,
  createDeterministicTempoChoice,
  getTempoAgentBands,
} from "@/lib/music/tempo-agent.shared";

describe("tempo agent shared helpers", () => {
  it("builds a tempo shortlist from genre prompt text", () => {
    const candidates = getTempoAgentBands({
      prompt: "skittery jungle breakbeat amen edits",
    });

    expect(candidates[0]).toMatchObject({
      id: "jungle",
      bpm: 168,
      swing: 0.07,
    });
  });

  it("builds a prompt that explains BPM and swing bounds", () => {
    const candidates = getTempoAgentBands({ prompt: "uk garage shuffle" });
    const prompt = buildTempoAgentPrompt(
      { prompt: "uk garage shuffle" },
      candidates,
    );

    expect(prompt).toContain("Genre prompt: uk garage shuffle");
    expect(prompt).toContain("Swing is a decimal fraction");
    expect(prompt).toContain("between 1 and 260");
    expect(prompt).toContain("between 0 and 0.5");
  });

  it("creates a deterministic fallback tempo choice with alternatives", () => {
    const choice = createDeterministicTempoChoice({
      prompt: "lofi boom bap drums",
      context: {
        bpm: 140,
        swing: 0.02,
        key: {
          tonic: "C",
          scaleId: "minor",
          referenceFrequency: 440,
        },
      },
    });

    expect(choice.selected).toMatchObject({
      bpm: 88,
      swing: 0.14,
    });
    expect(choice.selected.rationale).toContain("lofi boom bap drums");
    expect(choice.alternatives.length).toBeGreaterThan(0);
  });
});
