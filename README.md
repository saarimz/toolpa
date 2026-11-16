# Toolpa

Toolpa v2 is a browser instrument builder on [Elementary Audio](https://www.elementary.audio/). A chain is a source plus Tone (lowpass, then gain). An instrument adds oscillators, envelopes, filters, LFOs, a sampler, and effects. The same document plays live and renders offline, then saves as a content-addressed `.toolpa` file.

License: GPL-3.0-or-later.

## Requirements

- Node.js 22
- pnpm 10

## Playground

```bash
pnpm install
pnpm dev
```

The playground listens on [http://127.0.0.1:47291](http://127.0.0.1:47291).

Describe an instrument in the prompt box and press Generate. The page posts to `/api/agent` on this origin. The dev server reads the gateway settings and returns a rack. The piano roll, computer keyboard, Play, and Save generation work on that rack. Earlier generations stay in the page history. Web MIDI is off until you press Use Web MIDI.

With no gateway settings, Generate says so and uses the local mock model. To call Workers AI through Cloudflare, copy `apps/playground/.env.example` to `apps/playground/.env.local` and set:

- `TOOLPA_MODEL_PROVIDER=cloudflare-gateway`
- `TOOLPA_ALLOW_NETWORK=1`
- `TOOLPA_MODEL=workers-ai/@cf/openai/gpt-oss-120b`
- `CF_ACCOUNT_ID`
- `CF_GATEWAY_ID`
- `CF_AIG_TOKEN`

The proxy sends that token on both `cf-aig-authorization` and `Authorization`. The token stays in `.env.local` and never reaches the browser. For Vercel AI Gateway set `TOOLPA_MODEL_PROVIDER=vercel-gateway` and `AI_GATEWAY_API_KEY` instead. A 403 or 410 from the model is shown in the prompt panel.

The rest of the page is the chain editor: sine, seeded noise, or a WAV/MP3 sample, a tone control, Play, Render 1s WAV, and Save artifact. The device list, rack, and export dialog sit below it.

Firefox and WebKit need a working audio device for Play. A PulseAudio null sink is enough when the machine has no sound card.

## Gate

```bash
pnpm test
pnpm test:browser
pnpm slice:gate
```

`pnpm test` runs the unit tests and the offline WAV goldens. `pnpm test:browser` runs Playwright on Chromium, Firefox, and WebKit. `pnpm slice:gate` runs both, renders the golden chains again, and prints a local telemetry report: test counts, render speed as a multiple of realtime, decode time, and live latency and underruns.

Telemetry is the `@toolpa/trace` logger: NDJSON in tests, an in-memory ring in the browser. The network guard blocks `fetch`, XHR, WebSocket, and `sendBeacon` unless a call is allowed. The playground allows `blob:` and `data:` URLs, same-origin assets, and `POST /api/agent`. It blocks every other origin, including the model gateways. Tests stub `/api/agent` and never call a model.
