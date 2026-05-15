import { describe, expect, it, vi } from "vitest";

import { handlePromptMemoryRequest } from "@/app/api/prompt-memory/handler";

describe("prompt memory handler", () => {
  it("records valid prompt memory requests", async () => {
    const recordPrompt = vi.fn(async () => null);

    const response = await handlePromptMemoryRequest(
      new Request("http://localhost/api/prompt-memory", {
        method: "POST",
        body: JSON.stringify({
          action: "generate",
          source: "client.test",
          toolSlug: "midi-generator",
          userPrompt: "write a bassline",
        }),
      }),
      { recordPrompt },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ logged: true });
    expect(recordPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "generate",
        source: "client.test",
        toolSlug: "midi-generator",
        userPrompt: "write a bassline",
      }),
    );
  });

  it("rejects malformed prompt memory requests", async () => {
    const response = await handlePromptMemoryRequest(
      new Request("http://localhost/api/prompt-memory", {
        method: "POST",
        body: JSON.stringify({ userPrompt: "missing source" }),
      }),
      { recordPrompt: vi.fn() },
    );

    expect(response.status).toBe(400);
  });
});
