import { describe, expect, it, vi } from "vitest";

import { handleSuggestionsRequest } from "@/app/api/suggestions/handler";

describe("suggestions handler", () => {
  it("returns three model-generated suggestion chips", async () => {
    const generatePromptSuggestions = vi.fn().mockResolvedValue([
      "push hats late with ghosted amen cuts",
      "alternate snares every two bars with stuttered kicks",
      "leave bar one sparse then answer with reversed slices",
    ]);

    const response = await handleSuggestionsRequest(
      new Request("http://localhost/api/suggestions", {
        method: "POST",
        body: JSON.stringify({
          toolSlug: "intelligence-sampler",
          prompt: "skittery dnb pattern",
          context: {
            sampleId: "library:jungle/let-there-break",
            bpm: 160,
            swing: 0.1,
          },
        }),
      }),
      { generatePromptSuggestions },
    );

    await expect(response.json()).resolves.toEqual({
      suggestions: [
        "push hats late with ghosted amen cuts",
        "alternate snares every two bars with stuttered kicks",
        "leave bar one sparse then answer with reversed slices",
      ],
    });
    expect(generatePromptSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        toolSlug: "intelligence-sampler",
        prompt: "skittery dnb pattern",
        sampleName: "Let There Break",
        samplePack: "Blu Mar Ten - Jungle Jungle",
        sampleRole: "break",
        bpm: 160,
        swing: 0.1,
      }),
    );
  });

  it("accepts shipped tools", async () => {
    const generatePromptSuggestions = vi.fn().mockResolvedValue([
      "scan diagonals and leave ghost cells",
      "spiral from loudest chops into silence",
      "random seed with sparse repeats",
    ]);

    const response = await handleSuggestionsRequest(
      new Request("http://localhost/api/suggestions", {
        method: "POST",
        body: JSON.stringify({
          toolSlug: "grid-sampler",
          prompt: "make it stranger",
        }),
      }),
      { generatePromptSuggestions },
    );

    expect(response.status).toBe(200);
  });

  it("rejects unknown tools", async () => {
    const response = await handleSuggestionsRequest(
      new Request("http://localhost/api/suggestions", {
        method: "POST",
        body: JSON.stringify({
          toolSlug: "missing-tool",
          prompt: "make it stranger",
        }),
      }),
      { generatePromptSuggestions: vi.fn() },
    );

    expect(response.status).toBe(404);
  });
});
