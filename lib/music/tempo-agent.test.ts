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
        bpm: 132,
        swing: 0.04,
        rationale: "Driving techno needs a tight, mostly straight grid.",
      },
      alternatives: [],
      querySummary: "picked from groove references",
    },
  })),
}));

describe("tempo agent server", () => {
  it("returns a gateway-backed BPM and swing choice constrained by schema", async () => {
    const { suggestTempoWithAgent } = await import("@/lib/music/tempo-agent");

    await expect(
      suggestTempoWithAgent({
        prompt: "industrial techno warehouse pressure",
      }),
    ).resolves.toMatchObject({
      selected: {
        bpm: 132,
        swing: 0.04,
      },
      querySummary: "picked from groove references",
    });
  });
});
