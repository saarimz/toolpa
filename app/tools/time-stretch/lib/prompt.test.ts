import { describe, expect, it } from "vitest";

import { applyTimeStretchPromptToPatch } from "@/app/tools/time-stretch/lib/prompt";
import { DEFAULT_TIME_STRETCH_PATCH } from "@/app/tools/time-stretch/lib/schema";

describe("time stretch prompt", () => {
  it("maps ambient bar-length language into a deterministic patch", () => {
    const result = applyTimeStretchPromptToPatch(
      DEFAULT_TIME_STRETCH_PATCH,
      "stretch this to 64 bars at 100 bpm as a frozen wide subharmonic drone",
    );

    expect(result.patch).toMatchObject({
      bpm: 100,
      mode: "spectral-freeze",
      stereoWidth: 1.35,
      targetBars: 64,
    });
    expect(result.patch.octaveDownMix).toBeGreaterThan(0);
    expect(result.patch.subharmonicMix).toBeGreaterThan(0);
    expect(result.decisions.join(" ")).toContain("64 bars");
  });

  it("turns natural clean requests into a transparent non-bloom stretch", () => {
    const result = applyTimeStretchPromptToPatch(
      {
        ...DEFAULT_TIME_STRETCH_PATCH,
        octaveDownMix: 0.5,
        subharmonicMix: 0.5,
      },
      "make it clean, natural, transparent, and preserve transients for 8 bars",
    );

    expect(result.patch).toMatchObject({
      mode: "transparent",
      octaveDownMix: 0,
      phaseMode: "locked",
      subharmonicMix: 0,
      targetBars: 8,
      transientMode: "preserve",
    });
  });

  it("maps disintegration-loop language into baked performance movement", () => {
    const result = applyTimeStretchPromptToPatch(
      DEFAULT_TIME_STRETCH_PATCH,
      "make this an evolving ambient performance like the disintegration loops with tape decay",
    );

    expect(result.patch.performanceMode).toBe("disintegration-loop");
    expect(result.patch.degradation).toBeGreaterThan(0.5);
    expect(result.patch.wowFlutter).toBeGreaterThan(0.4);
    expect(result.patch.dropoutAmount).toBeGreaterThan(0.2);
    expect(result.decisions.join(" ")).toContain("baked tape disintegration");
  });
});
