import { describe, expect, it } from "vitest";

import { getAudibleDurationSec, getDeclickEnvelope } from "@/lib/audio/declick";

describe("declick envelope", () => {
  it("uses short attack and release ramps by default", () => {
    expect(getDeclickEnvelope({ durationSec: 1 })).toEqual({
      attackSec: 0.003,
      holdSec: 0.987,
      releaseSec: 0.01,
    });
  });

  it("caps fades for very short slices", () => {
    expect(getDeclickEnvelope({ durationSec: 0.008, preset: "soft" })).toEqual({
      attackSec: 0.002,
      holdSec: 0.004,
      releaseSec: 0.002,
    });
  });

  it("accounts for pitch-shifted audible duration", () => {
    expect(getAudibleDurationSec(1, 2)).toBe(0.5);
    expect(getAudibleDurationSec(1, 0.5)).toBe(2);
  });
});
