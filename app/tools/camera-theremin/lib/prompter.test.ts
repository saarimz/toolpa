import { describe, expect, it } from "vitest";

import { applyThereminPromptToControls } from "@/app/tools/camera-theremin/lib/prompter";

describe("camera theremin prompter", () => {
  it("maps prompt language into chord mode and control values", () => {
    expect(
      applyThereminPromptToControls("wide low smooth seventh glass drone", {
        chordCycle: "static",
        chordMode: "mono",
        degreeSpan: 14,
        octaveShift: -1,
        smoothing: 0.42,
        trackingMode: "hands",
      }),
    ).toMatchObject({
      chordCycle: "static",
      chordMode: "seventh",
      degreeSpan: 28,
      octaveShift: -2,
      smoothing: 0.68,
      trackingMode: "hands",
      summary: "hand tracking / seventh / static cycle / 29 notes / low / 68%",
    });
  });

  it("maps musical sequence language into chord-cycle controls", () => {
    expect(
      applyThereminPromptToControls("musical cadence triad progression", {
        chordCycle: "static",
        chordMode: "mono",
        degreeSpan: 14,
        octaveShift: -1,
        smoothing: 0.42,
        trackingMode: "hands",
      }),
    ).toMatchObject({
      chordCycle: "cadence",
      chordMode: "triad",
      summary: "hand tracking / triad / cadence cycle / 15 notes / mid / 42%",
    });
  });

  it("maps prompt language into alternate tracking modes", () => {
    expect(
      applyThereminPromptToControls("blink gaze theremin with seventh chords", {
        chordCycle: "static",
        chordMode: "mono",
        degreeSpan: 14,
        octaveShift: -1,
        smoothing: 0.42,
        trackingMode: "hands",
      }),
    ).toMatchObject({
      chordMode: "seventh",
      trackingMode: "eyes",
      summary: "eye tracking / seventh / static cycle / 15 notes / mid / 42%",
    });

    expect(
      applyThereminPromptToControls("full body conductor cadence", {
        chordCycle: "static",
        chordMode: "mono",
        degreeSpan: 14,
        octaveShift: -1,
        smoothing: 0.42,
        trackingMode: "hands",
      }),
    ).toMatchObject({
      chordCycle: "cadence",
      trackingMode: "body",
    });
  });

  it("keeps current controls when the prompt does not specify them", () => {
    expect(
      applyThereminPromptToControls("warm camera theremin", {
        chordCycle: "walk",
        chordMode: "triad",
        degreeSpan: 21,
        octaveShift: 0,
        smoothing: 0.2,
        trackingMode: "face",
      }),
    ).toMatchObject({
      chordCycle: "walk",
      chordMode: "triad",
      degreeSpan: 21,
      octaveShift: 0,
      smoothing: 0.2,
      trackingMode: "face",
    });
  });
});
