import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({
  getConfiguredGatewayModelId: vi.fn(() => "model"),
  getGatewayModel: vi.fn((model?: string) => model ?? "model"),
}));
vi.mock("server-only", () => ({}));

vi.mock("ai", () => ({
  Output: { object: vi.fn((input) => ({ output: input })) },
  generateText: vi.fn(async () => ({
    output: { suggestions: ["one", "two", "three"] },
  })),
}));

describe("prompt suggestions server", () => {
  it("returns generated suggestion strings", async () => {
    const { generatePromptSuggestions } = await import("@/lib/ai/prompt-suggestions");

    await expect(
      generatePromptSuggestions({
        toolSlug: "intelligence-sampler",
        prompt: "skittery",
        sampleName: "Amen",
      }),
    ).resolves.toEqual(["one", "two", "three"]);
  });
});
