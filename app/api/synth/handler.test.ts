import { describe, expect, it, vi } from "vitest";

import { handleGenerateSynthSceneRequest } from "@/app/api/synth/handler";
import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";

describe("synth generation handler", () => {
  it("returns a gateway-generated synth scene", async () => {
    const scene = createDefaultSynthScene("C dorian evolving FM");
    const generateSynthSceneWithGateway = vi.fn().mockResolvedValue(scene);

    const response = await handleGenerateSynthSceneRequest(
      new Request("http://localhost/api/synth", {
        method: "POST",
        body: JSON.stringify({ prompt: "C dorian evolving FM", mode: "generate" }),
      }),
      { generateSynthSceneWithGateway },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "gateway",
      scene: { id: scene.id },
    });
    expect(generateSynthSceneWithGateway).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "C dorian evolving FM", mode: "generate" }),
    );
  });

  it("falls back to the local agent when gateway generation fails", async () => {
    const scene = createDefaultSynthScene("F minor dub techno");
    const response = await handleGenerateSynthSceneRequest(
      new Request("http://localhost/api/synth", {
        method: "POST",
        body: JSON.stringify({
          prompt: "make it more ancient",
          mode: "evolve",
          scene,
        }),
      }),
      {
        generateSynthSceneWithGateway: vi
          .fn()
          .mockRejectedValue(new Error("missing gateway key")),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      source: string;
      warning: string;
      scene: { metadata: { rationale: string } };
    };
    expect(body.source).toBe("local-agent");
    expect(body.warning).toContain("missing gateway key");
    expect(body.scene.metadata.rationale).toContain("Variation keeps");
  });

  it("normalizes gateway timeout warnings for the synth UI", async () => {
    const response = await handleGenerateSynthSceneRequest(
      new Request("http://localhost/api/synth", {
        method: "POST",
        body: JSON.stringify({
          prompt: "slow evolving patch",
          mode: "generate",
        }),
      }),
      {
        generateSynthSceneWithGateway: vi
          .fn()
          .mockRejectedValue(
            new Error(
              "Invalid error response format: Gateway request failed: The operation was aborted due to timeout",
            ),
          ),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      source: "local-agent",
      warning: "Gateway timed out; kept local patch.",
    });
  });

  it("rejects invalid scene payloads", async () => {
    const response = await handleGenerateSynthSceneRequest(
      new Request("http://localhost/api/synth", {
        method: "POST",
        body: JSON.stringify({ prompt: "x", mode: "evolve", scene: { id: "bad" } }),
      }),
      { generateSynthSceneWithGateway: vi.fn() },
    );

    expect(response.status).toBe(400);
  });

  it("passes global music context through to synth generation", async () => {
    const scene = createDefaultSynthScene("quarter tone neutral");
    const generateSynthSceneWithGateway = vi.fn().mockResolvedValue(scene);
    const musicalContext = {
      bpm: 172,
      swing: 0.08,
      key: { tonic: "A", scaleId: "quarter-tone-neutral", referenceFrequency: 440 },
    };

    const response = await handleGenerateSynthSceneRequest(
      new Request("http://localhost/api/synth", {
        method: "POST",
        body: JSON.stringify({
          prompt: "use the global tuning",
          mode: "generate",
          musicalContext,
        }),
      }),
      { generateSynthSceneWithGateway },
    );

    expect(response.status).toBe(200);
    expect(generateSynthSceneWithGateway).toHaveBeenCalledWith(
      expect.objectContaining({ musicalContext }),
    );
  });
});
