# Slice 21.1 — Configured provider on the prompt panel

Depends on slice 21.

## Goal

The prompt panel shows the provider that the proxy will actually call.

## Steps

1. `GET /api/agent/status` returns `{ provider, label, model, configured, notice }` from `resolveAgent`.
2. The page loads that notice. It does not start from a mock sentence.
3. The first `plan` stage includes the provider label and notice.
4. Stream `application/x-ndjson` with `Cache-Control: no-cache`, `X-Accel-Buffering: no`, and a flush after each line.
5. Every 2 seconds while the model call is open, send `waiting for model (Ns)`.
6. The browser aborts after 90 seconds and shows that timeout.
7. Log the request, each stage, and the upstream status. Do not log the token.

## Tests

- Status, plan label, heartbeat, flush, and a 403 upstream log. No network.
- The client times out on a silent response.
- Playwright shows a stubbed Cloudflare notice.

## Done when

`pnpm slice:gate` is green.
