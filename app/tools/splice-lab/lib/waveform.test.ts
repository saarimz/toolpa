import { describe, expect, it } from "vitest";

import {
  computeSliceWaveformBars,
  computeWaveformBars,
} from "@/app/tools/splice-lab/lib/waveform";

describe("splice waveform helpers", () => {
  it("computes peak bars across a waveform region", () => {
    const bars = computeWaveformBars(
      createAudioBufferStub([0, 0.25, -0.75, 0.5, 0.125, -1, 0.375, 0.25]),
      4,
    );

    expect(bars).toEqual([0.25, 0.75, 1, 0.375]);
  });

  it("computes separate bar sets for equal slices", () => {
    const sliceBars = computeSliceWaveformBars(
      createAudioBufferStub([0, 0.5, 1, 0.25, -0.75, 0.125, -0.25, 0.875]),
      2,
      2,
    );

    expect(sliceBars).toEqual([
      [0.5, 1],
      [0.75, 0.875],
    ]);
  });
});

function createAudioBufferStub(samples: number[]) {
  return {
    length: samples.length,
    getChannelData: () => Float32Array.from(samples),
  } satisfies Pick<AudioBuffer, "length" | "getChannelData">;
}
