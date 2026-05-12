import { describe, expect, it, vi } from "vitest";

import { handleScaleSearchRequest } from "@/app/api/music/scale-search/handler";

describe("scale search handler", () => {
  it("returns an agentic key/scale choice", async () => {
    const chooseScaleWithAgent = vi.fn().mockResolvedValue({
      selected: {
        tonic: "C",
        scaleId: "pelog-cents",
        rationale: "Pelog gives the metallic non-Western color requested.",
      },
      alternatives: [],
      querySummary: "agent picked from catalog shortlist",
    });

    const response = await handleScaleSearchRequest(
      new Request("http://localhost/api/music/scale-search", {
        method: "POST",
        body: JSON.stringify({
          evidenceSummary: "evolving-fm-synth: active synth notes C, Eb, G",
          pitchClasses: [0, 3, 7],
          prompt: "metallic gamelan microtonal stutter",
          relativePitchClasses: [0, 3, 7],
          tonic: "C",
          limit: 12,
        }),
      }),
      { chooseScaleWithAgent },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      selected: {
        tonic: "C",
        scaleId: "pelog-cents",
      },
    });
    expect(chooseScaleWithAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "metallic gamelan microtonal stutter",
        pitchClasses: [0, 3, 7],
        relativePitchClasses: [0, 3, 7],
        tonic: "C",
      }),
    );
  });

  it("rejects empty prompt requests", async () => {
    const response = await handleScaleSearchRequest(
      new Request("http://localhost/api/music/scale-search", {
        method: "POST",
        body: JSON.stringify({ prompt: "" }),
      }),
      { chooseScaleWithAgent: vi.fn() },
    );

    expect(response.status).toBe(400);
  });
});
