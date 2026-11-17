# Slice 22 — Real prompt to instrument

Depends on slices 10, 11, and 21.

## Goal

A prompt compiles to the instrument the model described. A model failure is visible.

## Steps

1. Send `max_tokens` of at least 4096, overridable with `TOOLPA_MAX_TOKENS`.
2. Send `reasoning_effort: low` for `gpt-oss`.
3. Send `json_object` for Workers AI and `json_schema` for other OpenAI-compatible calls. Keep tolerant JSON extraction.
4. Log upstream `finish_reason` and content length. Do not log secrets.
5. Re-prompt on parse or model errors. Do not substitute a canned document.
6. Auto-adjust only silence, clipping, and NaN, and label that in the UI.
7. Accept a version 2 instrument: oscillators, envelopes, filter, LFOs, glide, effects, and macros.
8. Lower it with the existing oscillator, filter, and effect nodes.
9. Show the name, description, attempt, auto-adjust flag, and macro knobs.
10. Add `pnpm toolpa eval-prompts`, gated on `TOOLPA_ALLOW_NETWORK=1`.

## Tests

- Different stubbed prompts produce different hashes.
- Invalid model text retries and then fails visibly.
- Request shape for Workers AI.
- Playwright plays the lead and moves a macro.

## Done when

`pnpm slice:gate` is green.
