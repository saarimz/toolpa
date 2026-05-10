import {
  SynthSceneSchema,
  type SynthScene,
} from "@/app/tools/evolving-fm-synth/lib/schema";
import type { GlobalMusicContext } from "@/lib/music/context";

export const SYNTH_GATEWAY_CLIENT_TIMEOUT_MS: number | null = null;

export class SynthGatewayTimeoutError extends Error {
  constructor(timeoutMs: number) {
    const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    super(`Gateway timed out after ${timeoutSeconds}s; kept local patch.`);
    this.name = "SynthGatewayTimeoutError";
  }
}

export type SynthGatewayFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type FetchSynthSceneFromGatewayInput = {
  mode: "generate" | "evolve";
  prompt: string;
  scene: SynthScene;
  musicalContext?: GlobalMusicContext;
  timeoutMs?: number | null;
  fetcher?: SynthGatewayFetcher;
};

type FetchSynthSceneFromGatewayResult = {
  scene: SynthScene;
  source: string;
  warning: string | null;
};

export async function fetchSynthSceneFromGateway({
  mode,
  prompt,
  scene,
  musicalContext,
  timeoutMs = SYNTH_GATEWAY_CLIENT_TIMEOUT_MS,
  fetcher = fetch,
}: FetchSynthSceneFromGatewayInput): Promise<FetchSynthSceneFromGatewayResult> {
  const controller = new AbortController();
  let didTimeout = false;
  const shouldTimeout = typeof timeoutMs === "number" && timeoutMs > 0;
  const timeoutId = shouldTimeout
    ? setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, timeoutMs)
    : undefined;

  try {
    const response = await fetcher("/api/synth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        mode,
        musicalContext,
        prompt,
        scene,
      }),
    });
    const body: unknown = await response.json();

    if (!response.ok) {
      throw new Error(getStringField(body, "error") ?? "Synth generation failed");
    }

    const parsed = SynthSceneSchema.safeParse(getUnknownField(body, "scene"));
    if (!parsed.success) {
      throw new Error("Synth generation returned invalid scene data");
    }

    return {
      scene: parsed.data,
      source: getStringField(body, "source") ?? "gateway",
      warning: getStringField(body, "warning"),
    };
  } catch (error) {
    if (didTimeout || (shouldTimeout && isAbortError(error))) {
      throw new SynthGatewayTimeoutError(timeoutMs ?? 0);
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function getUnknownField(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  return record[key];
}

function getStringField(value: unknown, key: string): string | null {
  const field = getUnknownField(value, key);
  return typeof field === "string" ? field : null;
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError")
  );
}
