import { describe, expect, it } from "vitest";

import {
  createDefaultVisualizerScene,
  VisualizerSceneSchema,
} from "@/lib/visualizers/schema";

describe("VisualizerSceneSchema", () => {
  it("defaults to a bounded audio-reactive visual scene", () => {
    const scene = createDefaultVisualizerScene("neon spectrogram");

    expect(scene.schemaVersion).toBe(1);
    expect(scene.source).toBe("live-audio");
    expect(scene.mode).toBe("spectrogram");
    expect(scene.analyzer.fftSize).toBe(8192);
    expect(scene.mapping.primaryFeature).toBe("rms");
    expect(scene.mapping.sensitivity).toBe(1.35);
    expect(scene.mapping.reactivity).toBe(0.82);
    expect(scene.motion.speed).toBe(0.9);
    expect(scene.motion.microFluctuation).toBe(0.18);
    expect(scene.spectrogram.historySize).toBe(1152);
    expect(scene.particles.count).toBe(360);
    expect(scene.automation.length).toBeGreaterThan(0);
  });

  it("rejects unbounded visualizer values", () => {
    expect(() =>
      VisualizerSceneSchema.parse({
        mapping: { sensitivity: 20 },
        motion: { microFluctuation: 4 },
      }),
    ).toThrow();
  });
});
