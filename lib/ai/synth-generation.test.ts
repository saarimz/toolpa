import { afterEach, describe, expect, it, vi } from "vitest";

const aiMocks = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

vi.mock("@/lib/ai/gateway", () => ({
  getGatewayModel: vi.fn((model?: string) => model ?? "model"),
}));
vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({
  Output: { object: vi.fn((input) => ({ output: input })) },
  generateText: aiMocks.generateText,
}));

describe("synth generation", () => {
  const originalTimeout = process.env.SYNTH_GATEWAY_TIMEOUT_MS;

  afterEach(() => {
    process.env.SYNTH_GATEWAY_TIMEOUT_MS = originalTimeout;
    vi.resetModules();
    aiMocks.generateText.mockReset();
  });

  it("does not timeout synth generation by default", async () => {
    const { createDefaultSynthScene } = await import(
      "@/app/tools/evolving-fm-synth/lib/agent"
    );
    const { generateSynthSceneWithGateway } = await import(
      "@/lib/ai/synth-generation"
    );
    const scene = createDefaultSynthScene("C dorian evolving FM");
    aiMocks.generateText.mockResolvedValueOnce({ output: scene });

    await expect(
      generateSynthSceneWithGateway({
        mode: "generate",
        prompt: "C dorian evolving FM",
      }),
    ).resolves.toMatchObject({ id: scene.id });

    expect(aiMocks.generateText).toHaveBeenCalledOnce();
    expect(aiMocks.generateText.mock.calls[0]?.[0]).not.toHaveProperty("timeout");
  });

  it("allows the synth gateway timeout to be configured", async () => {
    process.env.SYNTH_GATEWAY_TIMEOUT_MS = "2500";
    const { createDefaultSynthScene } = await import(
      "@/app/tools/evolving-fm-synth/lib/agent"
    );
    const { generateSynthSceneWithGateway, getSynthGatewayTimeoutMs } = await import(
      "@/lib/ai/synth-generation"
    );
    const scene = createDefaultSynthScene("C dorian evolving FM");
    aiMocks.generateText.mockResolvedValueOnce({ output: scene });

    expect(getSynthGatewayTimeoutMs()).toBe(2500);

    await generateSynthSceneWithGateway({
      mode: "generate",
      prompt: "C dorian evolving FM",
    });

    expect(aiMocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: { totalMs: 2500 },
      }),
    );
  });

  it("ignores invalid synth gateway timeout configuration", async () => {
    process.env.SYNTH_GATEWAY_TIMEOUT_MS = "not-a-number";
    const { getSynthGatewayTimeoutMs } = await import("@/lib/ai/synth-generation");

    expect(getSynthGatewayTimeoutMs()).toBeUndefined();
  });
});
