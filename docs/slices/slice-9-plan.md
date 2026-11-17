# Slice 9 — IR

Depends on slice 1.

## Goal

A graph document has Elementary's per-node FNV-1a hash and a separate SHA-256 document id.

## Steps

1. Hash a node the way Elementary does, including the trailing zero in `hashString` and the child pre-mix.
2. Validate kinds, arity, refs, outputs, delay feedback, and cycles.
3. Inline one subpatch with a `__` prefix.
4. Diff two graphs by node hash. A keyed const stays mounted when its value changes.

## Telemetry

`ir.validate`, `ir.hash`, `ir.diff`.

## Tests

- `hashNode` equals `el.const` and `el.mul`.
- Keyed consts share a hash. Unkeyed consts do not.
- A cycle is `V10`. A subpatch inlines.
- SHA-256 document id ignores `meta`.
- Browsers agree. Slice 1 goldens stay put.

## Done when

`pnpm slice:gate` is green.
