import { describe, expect, it, vi } from "vitest";

import {
  createPattern,
  createStep,
  createTrack,
  PatternSchema,
  type Pattern,
} from "@/lib/pattern/schema";

const resolverMock = vi.hoisted(() => ({
  resolveSample: vi.fn(),
}));

vi.mock("@/lib/samples/resolver", () => ({
  resolveSample: resolverMock.resolveSample,
}));

function hashBuffer(buffer: AudioBuffer): string {
  const channelCount = buffer.numberOfChannels;
  const length = buffer.length;
  let acc = 0;
  for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
    const channel = buffer.getChannelData(channelIndex);
    for (let frame = 0; frame < length; frame += 1) {
      acc = (acc * 31 + Math.round(channel[frame] * 1_000_000)) | 0;
    }
  }
  return acc.toString(16);
}

function makeImpulseBuffer(durationSec: number, sampleRate: number): AudioBuffer {
  const length = Math.floor(durationSec * sampleRate);
  const context = new OfflineAudioContext(1, length, sampleRate);
  const buffer = context.createBuffer(1, length, sampleRate);
  const channel = buffer.getChannelData(0);
  channel[0] = 1;
  channel[1] = 0.7;
  channel[2] = 0.3;
  return buffer;
}

function makeBasePattern(): Pattern {
  return createPattern({
    id: "live-edit",
    name: "live-edit",
    bpm: 120,
    bars: 1,
    stepsPerBar: 8,
    tracks: [
      createTrack({
        id: "track-1",
        name: "track-1",
        sampleId: "sample-impulse",
        slot: 0,
        steps: Array.from({ length: 8 }, (_, index) =>
          createStep({
            active: index === 0,
            slot: 0,
          }),
        ),
      }),
    ],
  });
}

describe("live-edit audio: re-render after step toggle", () => {
  it("produces a different audio hash after toggling a step", async () => {
    const sampleRate = 44100;
    resolverMock.resolveSample.mockResolvedValue({
      audioBuffer: makeImpulseBuffer(0.05, sampleRate),
      id: "sample-impulse",
      name: "sample-impulse",
      origin: "library",
    });

    const { renderPatternToAudioBuffer } = await import("@/lib/audio/wav-render");

    const basePattern = makeBasePattern();
    const baseBuffer = await renderPatternToAudioBuffer(basePattern, {
      sampleRate,
    });
    const baseHash = hashBuffer(baseBuffer);

    const editedPattern = PatternSchema.parse({
      ...basePattern,
      tracks: basePattern.tracks.map((track) => ({
        ...track,
        steps: track.steps.map((step, index) =>
          index === 4
            ? createStep({ ...step, active: true, slot: track.slot ?? 0 })
            : step,
        ),
      })),
    });
    const editedBuffer = await renderPatternToAudioBuffer(editedPattern, {
      sampleRate,
    });
    const editedHash = hashBuffer(editedBuffer);

    expect(editedHash).not.toBe(baseHash);
  });

  it("a BPM ramp produces a different rendered length than the base", async () => {
    const sampleRate = 44100;
    resolverMock.resolveSample.mockResolvedValue({
      audioBuffer: makeImpulseBuffer(0.05, sampleRate),
      id: "sample-impulse",
      name: "sample-impulse",
      origin: "library",
    });

    const { renderPatternToAudioBuffer } = await import("@/lib/audio/wav-render");

    const slow = await renderPatternToAudioBuffer(
      PatternSchema.parse({ ...makeBasePattern(), bpm: 60 }),
      { sampleRate },
    );
    const fast = await renderPatternToAudioBuffer(
      PatternSchema.parse({ ...makeBasePattern(), bpm: 240 }),
      { sampleRate },
    );

    expect(slow.length).toBeGreaterThan(fast.length);
  });
});
