import { describe, expect, it } from "vitest";

import { renderVisualFrame, defaultDocument } from "@/app/tools/audio-visualizer/render";
import type { AudioFeatureFrame } from "@/lib/visualizers/audio-features";

describe("audio visualizer visual frame renderer", () => {
  it("keeps visual frame parameters finite and audio-reactive", () => {
    const quietFrame = makeFrame({ bass: 0.02, rms: 0.03, timestampMs: 120 });
    const loudFrame = makeFrame({ bass: 0.8, beat: 0.9, rms: 0.7, timestampMs: 240 });

    const quiet = renderVisualFrame(defaultDocument, quietFrame);
    const loud = renderVisualFrame(defaultDocument, loudFrame);

    expect(Object.values(loud).every((value) => typeof value !== "number" || Number.isFinite(value))).toBe(true);
    expect(loud.brightness).toBeGreaterThan(quiet.brightness);
    expect(loud.zoom).toBeGreaterThan(quiet.zoom);
  });
});

function makeFrame(patch: Partial<AudioFeatureFrame>): AudioFeatureFrame {
  return {
    air: 0.1,
    bass: 0.1,
    beat: 0,
    centroid: 0.35,
    flux: 0.1,
    highMid: 0.1,
    lowMid: 0.1,
    mid: 0.1,
    onset: 0,
    peak: 0.1,
    rms: 0.1,
    sub: 0.1,
    timestampMs: 0,
    ...patch,
  };
}
