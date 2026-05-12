import { describe, expect, it } from "vitest";

import { createCameraThereminPatch } from "@/app/tools/camera-theremin/lib/tone-playback";

describe("camera theremin tone patch", () => {
  it("maps prompt language into bounded synth patch settings", () => {
    expect(
      createCameraThereminPatch({
        bpm: 120,
        prompt: "glassy ambient bowed drone with space echo",
      }),
    ).toMatchObject({
      delayFeedback: 0.34,
      delayTimeSec: 0.375,
      oscillatorType: "triangle",
      reverbDecay: 3.4,
      reverbWet: 0.24,
      release: 0.42,
    });

    expect(
      createCameraThereminPatch({
        bpm: 200,
        prompt: "gritty acid saw lead",
      }),
    ).toMatchObject({
      delayFeedback: 0.22,
      delayTimeSec: 0.15,
      oscillatorType: "sawtooth",
      reverbDecay: 2.2,
      reverbWet: 0.16,
      release: 0.24,
    });
  });
});
