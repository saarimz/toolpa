# Slice 15 — Hosted models

Depends on slices 4 and 6.

## Goal

OpenAI-compatible, Anthropic, and Ollama providers sit behind the existing model and prompt interfaces. The default stays local.

## Steps

1. Read keys and base URLs from the environment.
2. Call only when `allowNetwork` is true.
3. Tests inject a transport. They do not call `fetch`.
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
