import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultSynthScene } from "@/app/tools/evolving-fm-synth/lib/agent";
import {
  fetchSynthSceneFromGateway,
  type SynthGatewayFetcher,
} from "@/app/tools/evolving-fm-synth/lib/gateway-request";

describe("synth gateway client request", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns a validated gateway scene response", async () => {
    const scene = createDefaultSynthScene("C dorian evolving FM");
    const fetcher: SynthGatewayFetcher = vi.fn(async () =>
      Response.json({ scene, source: "gateway", warning: "slow but usable" }),
    );

    await expect(
      fetchSynthSceneFromGateway({
        fetcher,
        mode: "generate",
        prompt: "C dorian evolving FM",
        scene,
      }),
    ).resolves.toMatchObject({
      scene: { id: scene.id },
      source: "gateway",
      warning: "slow but usable",
    });

    const init = vi.mocked(fetcher).mock.calls[0]?.[1];
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(requestBody).toMatchObject({
      mode: "generate",
      prompt: "C dorian evolving FM",
    });
  });

  it("aborts a hanging gateway request instead of staying pending", async () => {
    vi.useFakeTimers();
    const scene = createDefaultSynthScene("F minor dub techno");
    const fetcher: SynthGatewayFetcher = vi.fn(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const request = fetchSynthSceneFromGateway({
      fetcher,
      mode: "evolve",
      prompt: "more ancient",
      scene,
      timeoutMs: 25,
    });
    const expectation = expect(request).rejects.toThrow(
      "Gateway timed out after 1s; kept local patch.",
    );

    await vi.advanceTimersByTimeAsync(25);
    await expectation;
  });

  it("does not abort the gateway request by default", async () => {
    vi.useFakeTimers();
    const scene = createDefaultSynthScene("F minor dub techno");
    let resolveResponse: (response: Response) => void = () => {
      throw new Error("Gateway response resolver was not initialized");
    };
    const fetcher: SynthGatewayFetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );

    const request = fetchSynthSceneFromGateway({
      fetcher,
      mode: "generate",
      prompt: "F minor dub techno",
      scene,
    });

    await vi.advanceTimersByTimeAsync(60_000);
    resolveResponse(Response.json({ scene, source: "gateway" }));

    await expect(request).resolves.toMatchObject({
      scene: { id: scene.id },
      source: "gateway",
    });
  });

  it("rejects malformed gateway scene payloads", async () => {
    const scene = createDefaultSynthScene("glassy tones");
    const fetcher: SynthGatewayFetcher = vi.fn(async () =>
      Response.json({ scene: { id: "bad" }, source: "gateway" }),
    );

    await expect(
      fetchSynthSceneFromGateway({
        fetcher,
        mode: "generate",
        prompt: "glassy tones",
        scene,
      }),
    ).rejects.toThrow("Synth generation returned invalid scene data");
  });
});
