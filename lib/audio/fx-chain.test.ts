import { describe, expect, it } from "vitest";

import { fxDelayTimeToSeconds } from "@/lib/audio/fx-chain";

describe("fx chain timing", () => {
  it("maps tempo-synced FX delay values to seconds", () => {
    expect(fxDelayTimeToSeconds("16n", 120)).toBeCloseTo(0.125);
    expect(fxDelayTimeToSeconds("8n.", 120)).toBeCloseTo(0.375);
    expect(fxDelayTimeToSeconds("4n", 120)).toBeCloseTo(0.5);
  });
});
