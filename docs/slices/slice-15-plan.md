# Slice 15 — Hosted models

Depends on slices 4 and 6.

## Goal

Vercel AI Gateway and Cloudflare AI Gateway are the primary hosted path. Direct OpenAI-compatible chat and Ollama stay secondary. The default stays `mock`.

## Steps

1. Select `vercel-gateway`, `cloudflare-gateway`, `openai-compatible`, `ollama`, or `mock` from `TOOLPA_MODEL_PROVIDER`.
2. Read gateway keys from `AI_GATEWAY_API_KEY` and `CF_AIG_TOKEN`.
3. Call only when `allowNetwork` is true. Tests stub `fetch` and assert the URL, header, and model id.
4. Parse note tokens for the prompt path and device words for the agent.
5. Keep the API key out of the body, the trace, and the provenance.

## Telemetry

`model.call` with the provider kind, success, and word count. `generate.prompt` for the note path.

## Tests

- Three response shapes build one rack hash.
- `allowNetwork: false` does not call the transport.
- `hostedFromEnv` without the opt-in throws `NOT_CONFIGURED`.
- Note tokens `60:0:90` and `64:2:80` become two notes.
- Browsers use the injected provider.

## Done when

`pnpm slice:gate` is green.
