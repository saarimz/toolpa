import { describe, expect, it } from "vitest";

import {
  getSmoothedSampleSlices,
  resolveSamplePlaybackSegment,
} from "@/lib/audio/sample-engine";

function createAudioBufferStub({
  duration = 2,
  samples = [1, 0.8, 0.5, 0.2, 0.04, -0.02, -0.4, -0.8, -1],
  sampleRate = 4,
}: {
  duration?: number;
  samples?: number[];
  sampleRate?: number;
} = {}): AudioBuffer {
  return {
    duration,
    length: samples.length,
    numberOfChannels: 1,
    sampleRate,
    getChannelData: () => Float32Array.from(samples),
  } as unknown as AudioBuffer;
}

describe("sample engine smoothing", () => {
  it("snaps computed slice boundaries toward nearby zero crossings", () => {
    const slices = getSmoothedSampleSlices({
      audioBuffer: createAudioBufferStub(),
      sampleId: "sample",
      sliceCount: 2,
      zeroCrossingWindowMs: 1000,
    });

    expect(slices).toMatchObject([
      { slot: 0, startSec: 0, endSec: 1.25 },
      { slot: 1, startSec: 1.25, endSec: 2 },
    ]);
  });

  it("resolves one click-safe playback segment for live and offline engines", () => {
    const segment = resolveSamplePlaybackSegment({
      audioBuffer: createAudioBufferStub({ duration: 8, sampleRate: 8 }),
      event: {
        durationSec: 0.25,
        gain: 0.5,
        playbackRate: 2,
        reverse: false,
        sampleId: "sample",
        slot: 0,
        velocity: 0.8,
      },
      options: {
        declickPreset: "tight",
        sliceCount: 8,
      },
    });

    expect(segment.sourceOffsetSec).toBe(0);
    expect(segment.sourceDurationSec).toBe(0.25);
    expect(segment.audibleDurationSec).toBe(0.125);
    expect(segment.envelope).toMatchObject({ attackSec: 0.002, releaseSec: 0.006 });
    expect(segment.releaseStartOffsetSec).toBe(0.119);
    expect(segment.targetGain).toBe(0.4);
  });

  it("offsets reversed Tone.Player slices from the mirrored buffer position", () => {
    const segment = resolveSamplePlaybackSegment({
      audioBuffer: { duration: 8 } as AudioBuffer,
      event: {
        durationSec: 1,
        gain: 1,
        playbackRate: 1,
        reverse: true,
        sampleId: "sample",
        slot: 2,
        velocity: 1,
      },
      options: {
        slicesBySampleId: new Map([
          [
            "sample",
            Array.from({ length: 8 }, (_, slot) => ({
              durationSec: 1,
              endSec: slot + 1,
              id: `sample#slice/${slot}`,
              slot,
              sourceSampleId: "sample",
              startSec: slot,
            })),
          ],
        ]),
      },
    });

    expect(segment.sourceOffsetSec).toBe(5);
    expect(segment.slice).toMatchObject({ startSec: 2, endSec: 3 });
  });
});
