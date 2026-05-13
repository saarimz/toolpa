import { describe, expect, it } from "vitest";

import type { QuantizedThereminNote } from "@/app/tools/camera-theremin/lib/motion";
import {
  createCameraThereminPatch,
  getCameraThereminVoiceFrequencies,
} from "@/app/tools/camera-theremin/lib/tone-playback";

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

  it("derives deeper prompt-controlled modulation and octave layers", () => {
    const patch = createCameraThereminPatch({
      bpm: 124,
      prompt: "wide pulsing acid sub shimmer pluck",
    });

    expect(patch).toMatchObject({
      attack: 0.006,
      driveAmount: 0.42,
      filterQ: 8,
      octaveLayer: "both",
      oscillatorType: "sawtooth",
      portamento: 0.012,
      tremoloDepth: 0.42,
    });
    expect(patch.tremoloRateHz).toBeCloseTo(4.13, 2);
  });

  it("adds prompt-selected octave layers without dropping the scale chord", () => {
    const patch = createCameraThereminPatch({
      bpm: 120,
      prompt: "deep shimmer stereo theremin",
    });
    const note = {
      brightness: 0.5,
      chordCycle: "static",
      chordCycleIndex: 0,
      chordCycleLabel: "static",
      chordDegrees: [0, 2, 4, 6],
      chordLabel: "degree 1 seventh",
      chordMode: "seventh",
      chordRootDegree: 0,
      degree: 0,
      degreeLabel: "degree 1",
      detuneCents: 0,
      filterHz: 2400,
      frequencies: [220, 275, 330, 412],
      frequency: 220,
      noteLabel: "A minor degree 1",
      pan: 0,
      scaleLabel: "A Natural minor",
      volume: 0.8,
      x: 0.5,
      y: 0.5,
      z: 0.5,
    } satisfies QuantizedThereminNote;

    expect(getCameraThereminVoiceFrequencies(note, patch)).toEqual([
      220,
      275,
      330,
      412,
      110,
      440,
    ]);
  });
});
