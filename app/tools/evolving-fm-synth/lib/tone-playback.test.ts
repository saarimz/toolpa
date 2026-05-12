import { describe, expect, it } from "vitest";

import { buildCarrierOscillatorOptions } from "./tone-playback";

describe("evolving fm synth Tone playback", () => {
  it("uses custom partials only for the wavetable carrier root", () => {
    expect(buildCarrierOscillatorOptions("wavetable", [1, 0.5, 0.25])).toEqual({
      type: "custom",
      partials: [1, 0.5, 0.25],
    });
    expect(buildCarrierOscillatorOptions("sine", [1, 0.5, 0.25])).toEqual({
      type: "sine",
    });
    expect(buildCarrierOscillatorOptions("square", [1, 0.5, 0.25])).toEqual({
      type: "square",
    });
    expect(buildCarrierOscillatorOptions("sawtooth", [1, 0.5, 0.25])).toEqual({
      type: "sawtooth",
    });
  });
});
