# Slice 5 — Device registry and racks

Depends on slices 2 through 4.

## Goal

Devices register under one of four roles: midi, generator, instrument, effect. A rack orders them and refuses an illegal order. Effects mount after the voice sum, once each.

## Steps

1. Register a device id. Reject a duplicate and a bad id.
2. Compose an ordered rack. MIDI and generators come before the single instrument. Effects come after it.
3. Lower the rack. The `svf` count equals the effect count, not the note count.
4. Hash the rack from the device ids and roles.
5. Report that hash from all three browsers.

## Telemetry

`device.register` and `rack.compose`.

## Tests

- Unit: an effect before the instrument throws `RACK_ORDER`. Two instruments throw `RACK_ROLE`.
- Unit: three notes through two Tone devices lower to two `svf` nodes.
- Browser: the self-check hash and effect count match.

## Done when

`pnpm slice:gate` is green and slice 1 goldens still match.
