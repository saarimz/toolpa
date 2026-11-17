# Slice 21 — Prompt to instrument

Depends on slices 10, 11, 12, 15, and 20.

## Goal

A prompt in the playground becomes a playable instrument. Keys stay on the server.

## Steps

1. Post the prompt to `/api/agent` on the playground origin.
2. Resolve `TOOLPA_MODEL_PROVIDER`, `TOOLPA_MODEL`, `TOOLPA_ALLOW_NETWORK`, `CF_AIG_TOKEN`, `CF_ACCOUNT_ID`, `CF_GATEWAY_ID`, and `AI_GATEWAY_API_KEY`.
3. Default the Cloudflare model to `workers-ai/@cf/openai/gpt-oss-120b` and send the gateway token on both auth headers.
4. Parse `message.content`, including JSON wrapped in prose or a code fence. Ignore `reasoning`.
5. Validate the rack, test-render, and repair silence, clipping, and NaN within 3 attempts.
6. Show 403 and 410 on the page. Fall back to the mock model when no gateway is configured.
7. Load the document into the piano roll, play it from the keyboard, and save a `.toolpa`.

## Tests

- Unit repair loop, cookbook few-shot, fenced JSON.
- Proxy request shape with a stubbed transport. No network.
- Playwright types a prompt and hears the rack on Chromium, Firefox, and WebKit.
- The playground guard allows `/api/agent` and blocks gateway hosts.

## Done when

`pnpm slice:gate` is green.
