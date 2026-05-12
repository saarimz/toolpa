import { describe, expect, it } from "vitest";

import { analyzeAudioBuffer, type AudioBufferLike } from "@/lib/audio/offline-analysis";

describe("offline audio analysis", () => {
  it("accepts audible unclipped buffers with the expected duration", () => {
    const buffer = makeBuffer({
      data: Float32Array.from([0, 0.1, -0.1, 0.2, -0.2]),
      duration: 1,
    });

    expect(analyzeAudioBuffer(buffer, { expectedDurationSec: 1 })).toMatchObject({
      clipped: 0,
      hasNaN: false,
      ok: true,
    });
  });

  it("rejects silence, non-finite samples, clipping, and duration drift", () => {
    const buffer = makeBuffer({
      data: Float32Array.from([0, Number.NaN, 1, -1, 0]),
      duration: 1.5,
    });

    const analysis = analyzeAudioBuffer(buffer, { expectedDurationSec: 1 });

    expect(analysis.ok).toBe(false);
    expect(analysis.reasons).toEqual(
      expect.arrayContaining([
        "buffer contains NaN or Infinity",
        expect.stringContaining("peak exceeds limit"),
        expect.stringContaining("too many clipped samples"),
        expect.stringContaining("duration mismatch"),
      ]),
    );
  });
});

function makeBuffer({
  data,
  duration,
}: {
  data: Float32Array;
  duration: number;
}): AudioBufferLike {
  return {
    duration,
    getChannelData: () => data,
    length: data.length,
    numberOfChannels: 1,
    sampleRate: 44100,
  };
}
