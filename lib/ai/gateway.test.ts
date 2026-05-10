import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@ai-sdk/gateway", () => ({
  gateway: vi.fn((model: string) => ({ model })),
}));

import {
  DEFAULT_GATEWAY_MODEL,
  getConfiguredGatewayModelId,
  getGatewayModel,
  isGatewayConfigured,
} from "@/lib/ai/gateway";

describe("gateway config", () => {
  const originalModel = process.env.AI_GATEWAY_MODEL;
  const originalKey = process.env.AI_GATEWAY_API_KEY;
  const originalOidcToken = process.env.VERCEL_OIDC_TOKEN;

  afterEach(() => {
    process.env.AI_GATEWAY_MODEL = originalModel;
    process.env.AI_GATEWAY_API_KEY = originalKey;
    process.env.VERCEL_OIDC_TOKEN = originalOidcToken;
  });

  it("uses the configured model or default", () => {
    delete process.env.AI_GATEWAY_MODEL;
    expect(getConfiguredGatewayModelId()).toBe(DEFAULT_GATEWAY_MODEL);

    process.env.AI_GATEWAY_MODEL = "anthropic/example";
    expect(getConfiguredGatewayModelId()).toBe("anthropic/example");
  });

  it("reports configured API key and resolves gateway model", () => {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    expect(isGatewayConfigured()).toBe(false);

    process.env.AI_GATEWAY_API_KEY = "key";
    expect(isGatewayConfigured()).toBe(true);
    expect(getGatewayModel("anthropic/example")).toEqual({ model: "anthropic/example" });
  });

  it("reports configured Vercel OIDC auth without a manual API key", () => {
    delete process.env.AI_GATEWAY_API_KEY;
    process.env.VERCEL_OIDC_TOKEN = "oidc";

    expect(isGatewayConfigured()).toBe(true);
  });
});
