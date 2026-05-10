import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  getGatewayModel: vi.fn((model?: string) => model ?? "model"),
}));
vi.mock("server-only", () => ({}));

vi.mock("ai", () => ({
  Output: { object: vi.fn((input) => ({ output: input })) },
  streamText: vi.fn((input) => input),
}));

describe("pattern generation", () => {
  it("calls streamText with the Pattern schema output", async () => {
    const { streamPattern } = await import("@/lib/ai/pattern-generation");

    await expect(
      streamPattern({ system: "sys", prompt: "prompt", model: "m" }),
    ).resolves.toMatchObject({
      model: "m",
      system: "sys",
      prompt: "prompt",
      temperature: 0.7,
    });
  });
});
