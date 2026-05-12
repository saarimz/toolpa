import { describe, expect, it } from "vitest";

import {
  getScalePreviewFrequencies,
  getTonicFrequency,
} from "@/lib/audio/scale-audition";

describe("scale audition", () => {
  it("maps tonic and 12TET scale degrees to preview frequencies", () => {
    const frequencies = getScalePreviewFrequencies(
      { tonic: "C", scaleId: "major", referenceFrequency: 440 },
      { degreeCount: 3 },
    );

    expect(frequencies[0]).toBeCloseTo(261.626, 3);
    expect(frequencies[1]).toBeCloseTo(293.665, 3);
    expect(frequencies[2]).toBeCloseTo(329.628, 3);
  });

  it("keeps microtonal degree cents intact for previews", () => {
    const frequencies = getScalePreviewFrequencies(
      { tonic: "C", scaleId: "quarter-tone-neutral", referenceFrequency: 440 },
      { degreeCount: 2 },
    );
    const expectedNeutralSecond = 261.626 * 2 ** (150 / 1200);

    expect(frequencies[1]).toBeCloseTo(expectedNeutralSecond, 3);
  });

  it("uses the reference A4 frequency for tonic tuning", () => {
    expect(getTonicFrequency("A", 440)).toBeCloseTo(440, 3);
    expect(getTonicFrequency("A", 432)).toBeCloseTo(432, 3);
  });
});
