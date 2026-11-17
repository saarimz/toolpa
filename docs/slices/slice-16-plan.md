# Slice 16 — Authoring parity

Depends on slice 9.

## Goal

JSX, the line DSL, and JSON produce one canonical IR document.

## Steps

1. JSX factory `ir` flattens a graph into nodes, children first.
2. DSL lines are `graph`, nodes with `key=value` props, and `out`.
3. JSON is that same object.
4. `parseIr` gives the document id and the graph hash. Parsing the stamped graph again keeps both.

## Telemetry

`ir.author` with the format, node count, and whether the three ids matched.

## Tests

- A 440 Hz cycle matches across JSX, DSL, JSON, and a round trip.
- Browsers report the same flag and two nodes.

## Done when

`pnpm slice:gate` is green.
