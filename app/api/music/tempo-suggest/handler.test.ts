import { describe, expect, it, vi } from "vitest";

import { handleTempoSuggestRequest } from "@/app/api/music/tempo-suggest/handler";

describe("tempo suggest handler", () => {
  it("returns an agentic BPM and swing choice", async () => {
    const suggestTempoWithAgent = vi.fn().mockResolvedValue({
      selected: {
        bpm: 134,
        swing: 0.16,
        rationale: "UK garage needs shuffled percussion against a fast club pulse.",
      },
      alternatives: [],
      querySummary: "agent picked from groove references",
    });

    const response = await handleTempoSuggestRequest(
      new Request("http://localhost/api/music/tempo-suggest", {
        method: "POST",
        body: JSON.stringify({
          prompt: "uk garage shuffle",
          context: {
            bpm: 138,
            swing: 0,
            key: {
              tonic: "C",
              scaleId: "minor",
              referenceFrequency: 440,
            },
          },
        }),
      }),
      { suggestTempoWithAgent },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      selected: {
        bpm: 134,
        swing: 0.16,
      },
    });
    expect(suggestTempoWithAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "uk garage shuffle",
      }),
    );
  });

  it("rejects empty prompt requests", async () => {
    const response = await handleTempoSuggestRequest(
      new Request("http://localhost/api/music/tempo-suggest", {
        method: "POST",
        body: JSON.stringify({ prompt: "" }),
      }),
      { suggestTempoWithAgent: vi.fn() },
    );

    expect(response.status).toBe(400);
  });
});
