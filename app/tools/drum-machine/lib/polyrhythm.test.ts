import { describe, expect, it } from "vitest";

import {
  createDefaultDrumPattern,
  gcd,
  getPatternCycleLength,
  lcm,
  resizeTrackSteps,
} from "@/app/tools/drum-machine/lib/polyrhythm";

describe("drum machine polyrhythm", () => {
  it("computes gcd and lcm", () => {
    expect(gcd(16, 12)).toBe(4);
    expect(lcm(16, 12)).toBe(48);
    expect(lcm(16, 13)).toBe(208);
  });

  it("reports the combined pattern cycle length", () => {
    const pattern = createDefaultDrumPattern("library:jungle/let-there-break");

    expect(getPatternCycleLength(pattern.tracks)).toBe(624);
  });

  it("resizes a track without losing existing steps", () => {
    const pattern = createDefaultDrumPattern("library:jungle/let-there-break");
    const track = resizeTrackSteps(pattern.tracks[0]!, 8);

    expect(track.steps).toHaveLength(8);
    expect(track.steps[0]?.active).toBe(true);
  });
});
