import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/ai/gateway", () => ({
  getConfiguredGatewayModelId: vi.fn(() => "model"),
  getGatewayModel: vi.fn(() => "model"),
  isGatewayConfigured: vi.fn(() => true),
}));

vi.mock("ai", () => ({
  Output: { object: vi.fn((input) => ({ output: input })) },
  generateText: vi.fn(async () => ({
    output: {
      selected: {
        tonic: "C",
        scaleId: "quarter-tone-neutral",
        rationale: "Neutral quarter tones fit the liminal prompt.",
      },
      alternatives: [],
      querySummary: "picked from the shortlist",
    },
  })),
}));

describe("scale agent server", () => {
  it("returns a gateway-backed scale choice constrained by schema", async () => {
    const { chooseScaleWithAgent } = await import("@/lib/music/scale-agent");

    await expect(
      chooseScaleWithAgent({
        prompt: "microtonal neutral floating pads",
        tonic: "C",
        limit: 8,
      }),
    ).resolves.toMatchObject({
      selected: {
        tonic: "C",
        scaleId: "quarter-tone-neutral",
      },
      querySummary: "picked from the shortlist",
    });
  });
});
