import "server-only";

import { gateway, type GatewayModelId } from "@ai-sdk/gateway";

export const DEFAULT_GATEWAY_MODEL = "anthropic/claude-sonnet-4.6";

export function getConfiguredGatewayModelId() {
  return process.env.AI_GATEWAY_MODEL || DEFAULT_GATEWAY_MODEL;
}

export function isGatewayConfigured() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

export function getGatewayModel(modelId = getConfiguredGatewayModelId()) {
  return gateway(modelId as GatewayModelId);
}
