import { describe, expect, it, vi } from "vitest";

import { handleCopilotRequest } from "@/app/api/copilot/handler";

describe("copilot handler", () => {
  it("returns a producer copilot reply with enabled tool context", async () => {
    const generateReply = vi.fn().mockResolvedValue(
      "Open /tools/midi-generator for chords, then move to Evolving FM Synth.",
    );

    const response = await handleCopilotRequest(
      new Request("http://localhost/api/copilot", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "How do I make an intro?" }],
        }),
      }),
      { generateReply, isGatewayConfigured: () => true },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: {
        role: "assistant",
        content:
          "Open /tools/midi-generator for chords, then move to Evolving FM Synth.",
      },
    });
    expect(generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "How do I make an intro?" }],
        tools: expect.arrayContaining([
          expect.objectContaining({ route: "/tools/midi-generator" }),
        ]),
      }),
    );
  });

  it("rejects invalid chat payloads", async () => {
    const response = await handleCopilotRequest(
      new Request("http://localhost/api/copilot", {
        method: "POST",
        body: JSON.stringify({ messages: [] }),
      }),
      { generateReply: vi.fn(), isGatewayConfigured: () => true },
    );

    expect(response.status).toBe(400);
  });

  it("reports missing AI Gateway configuration", async () => {
    const response = await handleCopilotRequest(
      new Request("http://localhost/api/copilot", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "What should I do?" }],
        }),
      }),
      { generateReply: vi.fn(), isGatewayConfigured: () => false },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("AI_GATEWAY_API_KEY"),
    });
  });
});
