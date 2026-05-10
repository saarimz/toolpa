import { describe, expect, it } from "vitest";

import {
  computeEqualSlices,
  createSliceSampleId,
  getSliceForSlot,
} from "@/app/tools/intelligence-sampler/lib/slice";

describe("intelligence sampler slice math", () => {
  it("divides a sample into equal slice regions", () => {
    const slices = computeEqualSlices({
      sourceSampleId: "library:test",
      durationSec: 8,
      sliceCount: 8,
    });

    expect(slices).toHaveLength(8);
    expect(slices[0]).toMatchObject({ slot: 0, startSec: 0, endSec: 1 });
    expect(slices[7]).toMatchObject({ slot: 7, startSec: 7, endSec: 8 });
  });

  it("creates stable virtual slice ids", () => {
    expect(createSliceSampleId("library:test", 3)).toBe("library:test#slice/3");
  });

  it("throws for missing slots", () => {
    const slices = computeEqualSlices({
      sourceSampleId: "library:test",
      durationSec: 2,
      sliceCount: 2,
    });

    expect(getSliceForSlot(slices, 1).startSec).toBe(1);
    expect(() => getSliceForSlot(slices, 2)).toThrow("Missing slice slot 2");
  });
});
