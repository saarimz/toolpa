import { describe, expect, it } from "vitest";

import { applyThereminPromptToControls } from "@/app/tools/camera-theremin/lib/prompter";

describe("camera theremin prompter", () => {
  it("maps prompt language into chord mode and control values", () => {
    expect(
      applyThereminPromptToControls("wide low smooth seventh glass drone", {
        chordMode: "mono",
        degreeSpan: 14,
        octaveShift: -1,
        smoothing: 0.42,
      }),
    ).toMatchObject({
      chordMode: "seventh",
      degreeSpan: 28,
      octaveShift: -2,
      smoothing: 0.68,
      summary: "seventh / 29 notes / low / 68%",
    });
  });

  it("keeps current controls when the prompt does not specify them", () => {
    expect(
      applyThereminPromptToControls("warm camera theremin", {
        chordMode: "triad",
        degreeSpan: 21,
        octaveShift: 0,
        smoothing: 0.2,
      }),
    ).toMatchObject({
      chordMode: "triad",
      degreeSpan: 21,
      octaveShift: 0,
      smoothing: 0.2,
    });
  });
});
