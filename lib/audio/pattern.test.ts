import { describe, expect, it } from "vitest";

import {
  collectPatternPlaybackPlan,
  collectPatternEvents,
  collectPatternSampleIds,
  getStepDurationSec,
  pitchCentsToPlaybackRate,
  pitchToPlaybackRate,
  resolveStepPitchCents,
} from "@/lib/audio/pattern";
import { createPattern, createStep, createTrack } from "@/lib/pattern/schema";

describe("pattern event planner", () => {
  it("plans deterministic step events with slot and velocity", () => {
    const pattern = createPattern({
      id: "pattern",
      name: "pattern",
      bpm: 120,
      bars: 1,
      stepsPerBar: 16,
      tracks: [
        createTrack({
          id: "track",
          name: "track",
          sampleId: "library:test",
          slot: 2,
          steps: [
            createStep({ active: true, velocity: 0.5 }),
            createStep({ active: false }),
          ],
        }),
      ],
    });

    expect(collectPatternEvents(pattern, { random: () => 0 }).slice(0, 2)).toMatchObject([
      { stepIndex: 0, slot: 2, velocity: 0.5, timeSec: 0 },
      { stepIndex: 2, slot: 2, velocity: 0.5 },
    ]);
  });

  it("applies probability, microShift, repeats, and conditions", () => {
    const pattern = createPattern({
      id: "pattern",
      name: "pattern",
      bpm: 120,
      bars: 2,
      stepsPerBar: 4,
      tracks: [
        createTrack({
          id: "track",
          name: "track",
          sampleId: "library:test",
          steps: [
            createStep({
              active: true,
              probability: 1,
              microShift: 0.5,
              repeats: 2,
              conditions: [{ type: "everyN", n: 2 }],
            }),
          ],
        }),
      ],
    });

    const stepDuration = getStepDurationSec(pattern);
    const events = collectPatternEvents(pattern, { random: () => 0 });

    expect(events).toHaveLength(8);
    expect(events[0]?.barIndex).toBe(1);
    expect(events[0]?.timeSec).toBeCloseTo(4 * stepDuration + 0.5 * stepDuration);
    expect(events[1]?.timeSec).toBeCloseTo(
      4 * stepDuration + 0.5 * stepDuration + stepDuration / 2,
    );
  });

  it("drops probability-zero events when probability is rolled at plan time", () => {
    const pattern = createPattern({
      id: "pattern",
      name: "pattern",
      bars: 1,
      stepsPerBar: 1,
      tracks: [
        createTrack({
          id: "track",
          name: "track",
          sampleId: "library:test",
          steps: [createStep({ active: true, probability: 0 })],
        }),
      ],
    });

    expect(collectPatternEvents(pattern, { random: () => 1 })).toHaveLength(0);
  });

  it("emits probability-eligible events when probability is deferred to callers", () => {
    const pattern = createPattern({
      id: "pattern",
      name: "pattern",
      bars: 1,
      stepsPerBar: 3,
      tracks: [
        createTrack({
          id: "track",
          name: "track",
          sampleId: "library:test",
          steps: [
            createStep({ active: true, probability: 0 }),
            createStep({ active: true, probability: 0.7 }),
            createStep({ active: false, probability: 1 }),
          ],
        }),
      ],
    });

    const events = collectPatternEvents(pattern, {
      random: () => 1,
      probabilityMode: "defer",
    });

    expect(events).toHaveLength(2);
    expect(events[0]?.probability).toBe(0);
    expect(events[1]?.probability).toBeCloseTo(0.7);
  });

  it("converts pitch to playback rate", () => {
    expect(pitchToPlaybackRate(12)).toBeCloseTo(2);
    expect(pitchToPlaybackRate(-12)).toBeCloseTo(0.5);
    expect(pitchCentsToPlaybackRate(1200)).toBeCloseTo(2);
    expect(pitchCentsToPlaybackRate(-1200)).toBeCloseTo(0.5);
  });

  it("prefers pitch cents and tuning refs for sample playback tuning", () => {
    expect(resolveStepPitchCents(createStep({ pitchSemitones: 7 }))).toBe(700);
    expect(resolveStepPitchCents(createStep({ pitchCents: 150 }))).toBe(150);
    expect(
      resolveStepPitchCents(createStep({ tuningRef: { scaleId: "slendro-cents", degree: 2 } })),
    ).toBe(480);
    expect(
      resolveStepPitchCents(createStep({ tuningRef: { degree: 1 } }), {
        bpm: 128,
        swing: 0,
        key: { tonic: "C", scaleId: "quarter-tone-neutral", referenceFrequency: 440 },
      }),
    ).toBe(150);
  });

  it("returns visible playback agency traces for fired and skipped steps", () => {
    const pattern = createPattern({
      id: "pattern",
      name: "pattern",
      bpm: 120,
      bars: 1,
      stepsPerBar: 4,
      tracks: [
        createTrack({
          id: "track",
          name: "track",
          sampleId: "library:test",
          steps: [
            createStep({ active: true }),
            createStep({ active: false }),
            createStep({ active: true, probability: 0.25 }),
            createStep({ active: true, conditions: [{ type: "firstOfN", n: 2 }] }),
          ],
        }),
      ],
    });

    const plan = collectPatternPlaybackPlan(pattern, { random: () => 1 });

    expect(plan.events).toHaveLength(2);
    expect(plan.traces).toMatchObject([
      { stepIndex: 0, fired: true, reason: "fired" },
      { stepIndex: 1, fired: false, reason: "skip-inactive" },
      { stepIndex: 2, fired: false, reason: "skip-prob" },
      { stepIndex: 3, fired: true, reason: "fired" },
    ]);
  });

  it("resolves choke groups from step first, then track default", () => {
    const pattern = createPattern({
      id: "pattern",
      name: "pattern",
      tracks: [
        createTrack({
          id: "track",
          name: "track",
          sampleId: "library:test",
          chokeGroup: "break",
          steps: [
            createStep({ active: true }),
            createStep({ active: true, chokeGroup: "fill" }),
          ],
        }),
      ],
    });

    const events = collectPatternEvents(pattern, { random: () => 0 });

    expect(events[0]?.chokeGroup).toBe("break");
    expect(events[1]?.chokeGroup).toBe("fill");
  });

  it("collects every track and step-level sample id needed by playback engines", () => {
    const pattern = createPattern({
      id: "pattern",
      name: "pattern",
      tracks: [
        createTrack({
          id: "track",
          name: "track",
          sampleId: "library:test/default",
          steps: [
            createStep({ active: true }),
            createStep({ active: true, sampleId: "library:test/fill" }),
            createStep({ active: false, sampleId: "library:test/ghost" }),
          ],
        }),
      ],
    });

    expect(collectPatternSampleIds(pattern)).toEqual([
      "library:test/default",
      "library:test/fill",
      "library:test/ghost",
    ]);
  });

  it("schedules each drum lane with its own track sample id", () => {
    const pattern = createPattern({
      id: "pattern",
      name: "pattern",
      bars: 1,
      stepsPerBar: 1,
      tracks: [
        createTrack({
          id: "kick",
          name: "kick",
          sampleId: "library:test/kick",
          steps: [createStep({ active: true })],
        }),
        createTrack({
          id: "snare",
          name: "snare",
          sampleId: "library:test/snare",
          steps: [createStep({ active: true })],
        }),
      ],
    });

    expect(
      collectPatternEvents(pattern, { random: () => 0 }).map((event) => event.sampleId),
    ).toEqual(["library:test/kick", "library:test/snare"]);
  });
});
