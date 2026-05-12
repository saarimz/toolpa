import { describe, expect, it } from "vitest";

import { createDefaultSynthScene } from "./agent";
import {
  collectSynthEvents,
  collectSynthModulationEvents,
  getSynthSceneDurationSec,
  getSynthStepDurationSec,
  morphPartials,
} from "./events";

describe("evolving fm synth events", () => {
  it("collects playable note events from active steps", () => {
    const scene = createDefaultSynthScene();
    const events = collectSynthEvents(scene, { random: () => 0 });

    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => String(event.note).length >= 2)).toBe(true);
    expect(events.every((event) => event.durationSec > 0)).toBe(true);
    expect(events.every((event) => event.rootWaveform === "wavetable")).toBe(true);
  });

  it("derives step and loop timing from BPM and grid shape", () => {
    const scene = createDefaultSynthScene();

    expect(getSynthStepDurationSec(scene)).toBeCloseTo(60 / scene.bpm / 4);
    expect(getSynthSceneDurationSec(scene)).toBeCloseTo((60 / scene.bpm) * 4 * scene.bars);
  });

  it("creates one discrete modulation point per evolution bar", () => {
    const scene = createDefaultSynthScene();
    const modulation = collectSynthModulationEvents(scene);

    expect(modulation).toHaveLength(scene.bars);
    expect(modulation[0]?.timeSec).toBe(0);
    expect(modulation.at(-1)?.phase).toBe(1);
    expect(modulation.every((event) => event.cutoffHz >= 80 && event.cutoffHz <= 12000)).toBe(
      true,
    );
  });

  it("morphs wavetable partials while preserving the fundamental", () => {
    const partials = morphPartials([1, 0.4, 0.2, 0.1], 0.8);

    expect(partials[0]).toBe(1);
    expect(partials.every((partial) => partial >= 0 && partial <= 1)).toBe(true);
    expect(partials[1]).not.toBe(0.4);
  });
});
