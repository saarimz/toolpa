# Hosted models

The default provider is `mock`. It never opens a socket. A hosted call happens only when `TOOLPA_ALLOW_NETWORK=1` and the selected provider has its key.

Set the provider with `TOOLPA_MODEL_PROVIDER`:

| Value | Role | Required environment |
| --- | --- | --- |
| `mock` | Default. No network. | None. |
| `vercel-gateway` | Primary. Vercel AI Gateway, OpenAI-compatible. | `AI_GATEWAY_API_KEY`. Optional `AI_GATEWAY_MODEL` (default `openai/gpt-4o-mini`) and `AI_GATEWAY_BASE_URL`. |
| `cloudflare-gateway` | Primary. Cloudflare AI Gateway universal endpoint. | `CF_AIG_TOKEN`, `CF_ACCOUNT_ID`, `CF_GATEWAY_ID`, and `TOOLPA_ALLOW_NETWORK=1`. Optional `TOOLPA_MODEL` (default `workers-ai/@cf/openai/gpt-oss-120b`), `CF_AIG_MODEL`, and `CF_AIG_BASE_URL`. |
| `openai-compatible` | Secondary direct chat completions. | `OPENAI_API_KEY`. Optional `OPENAI_BASE_URL` and `OPENAI_MODEL`. |
| `ollama` | Secondary local server. | Optional `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`) and `OLLAMA_MODEL`. |

`openai` is an alias of `openai-compatible`. `anthropic` remains a direct Messages API option via `ANTHROPIC_API_KEY`. Gateways are the path for Claude and GPT model ids such as `anthropic/claude-haiku` and `openai/gpt-4o-mini`.

## Requests

Vercel AI Gateway:

`POST https://ai-gateway.vercel.sh/v1/chat/completions`

`Authorization: Bearer $AI_GATEWAY_API_KEY`

Cloudflare AI Gateway:

`POST https://gateway.ai.cloudflare.com/v1/$CF_ACCOUNT_ID/$CF_GATEWAY_ID/compat/chat/completions`

`cf-aig-authorization: Bearer $CF_AIG_TOKEN`

`Authorization: Bearer $CF_AIG_TOKEN`

Workers AI uses the same token on both headers. The default model is `workers-ai/@cf/openai/gpt-oss-120b`, which answers 200 on the Workers Free plan. `TOOLPA_MODEL` overrides it, then `CF_AIG_MODEL`. `@cf/meta/llama-3.1-8b-instruct` is deprecated and returns 410. `@cf/moonshotai/kimi-k2.6` is paid-plan only and returns 403. Those statuses are shown in the playground. A model id that starts with `anthropic/` uses `ANTHROPIC_API_KEY` on `Authorization` when that key is set. A model id that starts with `openai/` (not `workers-ai/`) uses `OPENAI_API_KEY` the same way.

Both bodies are OpenAI chat completions: `{ "model", "messages": [{ "role": "user", "content" }] }`. The reply uses `choices[0].message.content` only. A separate `reasoning` field is ignored. The instrument parser accepts JSON wrapped in prose or a code fence. The key stays in the header. It is not written into the body, the URL, the trace, or the agent provenance.

The playground proxy is `POST /api/agent`. `GET /api/agent/status` returns the provider, model, and notice from the same resolver, and the prompt panel shows that notice on load. Put the variables in `apps/playground/.env.local`. The browser never sees them. The dev server logs each agent request, stage, and upstream status, and does not log the token.

`GatewayProvider` implements `ModelProvider`. `RemotePromptProvider` takes that provider's `complete` function when a prompt should become `midi:step:velocity` notes. With no function, it still throws `NOT_CONFIGURED`.
