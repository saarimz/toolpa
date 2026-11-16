# Slice 19 — Storage

Depends on the artifact store.

## Goal

IndexedDB indexes every artifact. Blobs prefer OPFS and fall back to IndexedDB.

## Steps

1. Open IndexedDB `toolpa` with an index and a blob store.
2. Try OPFS. On failure or a two-second timeout, use the IndexedDB blob store.
3. Record the backend next to the id.
4. Point the playground and the storage probe at `DurableStore`.
5. Make the WebKit storage check fail the gate if it does not round-trip.

## Telemetry

`storage.backend` with `opfs` or `idb`. Saves keep `artifact.saved`.

## Tests

- A fallback bucket saves, loads, lists, and stores a sample.
- All three browsers keep the parent pointer and the sample bytes.
- The playground can save on WebKit.

## Done when

`pnpm slice:gate` is green.
