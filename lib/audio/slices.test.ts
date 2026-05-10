import { describe, expect, it } from "vitest";

import {
  computeEqualSlices,
  detectOnsetSlices,
  detectOnsetTimesFromSignal,
  snapSliceRegionsToZeroCrossings,
  snapTimeToNearestZeroCrossing,
} from "@/lib/audio/slices";

describe("audio slices", () => {
  it("detects onset times from energy changes", () => {
    const sampleRate = 1000;
    const signal = new Float32Array(4000);
    signal.fill(0.9, 1000, 1040);
    signal.fill(0.75, 2000, 2040);
    signal.fill(0.8, 3000, 3040);

    expect(
      detectOnsetTimesFromSignal(signal, sampleRate, {
        frameSize: 100,
        maxOnsets: 3,
        minSpacingSec: 0.2,
      }),
    ).toEqual([1, 2, 3]);
  });

  it("builds onset slice regions with fixed output length", () => {
    const sampleRate = 1000;
    const signal = new Float32Array(4000);
    signal.fill(0.9, 1000, 1040);
    signal.fill(0.75, 2000, 2040);
    signal.fill(0.8, 3000, 3040);

    const slices = detectOnsetSlices({
      sourceSampleId: "sample",
      channelData: signal,
      sampleRate,
      durationSec: 4,
      sliceCount: 4,
      frameSize: 100,
      snapToZeroCrossing: false,
      transientPrerollMs: 0,
    });

    expect(slices).toHaveLength(4);
    expect(slices.map((slice) => slice.startSec)).toEqual([0, 1, 2, 3]);
    expect(slices.at(-1)?.endSec).toBe(4);
  });

  it("falls back toward equal boundaries when not enough onsets are present", () => {
    const slices = detectOnsetSlices({
      sourceSampleId: "sample",
      channelData: new Float32Array(4000),
      sampleRate: 1000,
      durationSec: 4,
      sliceCount: 4,
      frameSize: 100,
      snapToZeroCrossing: false,
      transientPrerollMs: 0,
    });

    expect(slices).toHaveLength(4);
    expect(slices.map((slice) => slice.startSec)).toEqual(
      computeEqualSlices({ sourceSampleId: "sample", durationSec: 4, sliceCount: 4 }).map(
        (slice) => slice.startSec,
      ),
    );
  });

  it("snaps arbitrary boundaries toward nearby zero crossings", () => {
    const sampleRate = 1000;
    const signal = new Float32Array(2000);
    signal.fill(0.7);
    signal[997] = -0.1;
    signal[998] = -0.02;
    signal[999] = 0;
    signal[1000] = 0.7;
    signal[1001] = 0.9;

    expect(
      snapTimeToNearestZeroCrossing({
        channelData: signal,
        durationSec: 2,
        sampleRate,
        timeSec: 1,
        windowMs: 5,
      }),
    ).toBe(0.999);
  });

  it("computes equal slices with zero-crossing-smoothed internal boundaries", () => {
    const sampleRate = 1000;
    const signal = new Float32Array(2000);
    signal.fill(0.8);
    signal[995] = -0.5;
    signal[996] = -0.1;
    signal[997] = 0;
    signal[1000] = 0.8;

    const slices = computeEqualSlices({
      channelData: signal,
      sourceSampleId: "sample",
      sampleRate,
      durationSec: 2,
      sliceCount: 2,
    });

    expect(slices[0]?.endSec).toBe(0.997);
    expect(slices[1]?.startSec).toBe(0.997);
  });

  it("snaps existing slice regions without changing their count", () => {
    const sampleRate = 1000;
    const signal = new Float32Array(3000);
    signal.fill(0.9);
    signal[1497] = 0;
    signal[1500] = 0.9;
    const slices = computeEqualSlices({
      sourceSampleId: "sample",
      durationSec: 3,
      sliceCount: 2,
    });

    const snapped = snapSliceRegionsToZeroCrossings({
      channelData: signal,
      durationSec: 3,
      sampleRate,
      slices,
    });

    expect(snapped).toHaveLength(2);
    expect(snapped[0]?.endSec).toBe(1.497);
    expect(snapped[1]?.startSec).toBe(1.497);
  });
});
