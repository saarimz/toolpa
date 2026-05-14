import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  PatternSchema,
  StepSchema,
  createPattern,
  createStep,
  createTrack,
  stepConditionsHold,
} from "@/lib/pattern/schema";

describe("PatternSchema", () => {
  it("applies robust step defaults", () => {
    expect(StepSchema.parse({})).toMatchObject({
      active: false,
      velocity: 1,
      microShift: 0,
      probability: 1,
      pitchSemitones: 0,
      reverse: false,
      repeats: 1,
    });
  });

  it("rejects out-of-range performance fields", () => {
    expect(() => StepSchema.parse({ velocity: 1.2 })).toThrow();
    expect(() => StepSchema.parse({ microShift: 0.9 })).toThrow();
    expect(() => StepSchema.parse({ probability: -0.1 })).toThrow();
  });

  it("parses a future-proof pattern with per-step slot and pitch", () => {
    const track = createTrack({
      id: "track-1",
      name: "break",
      sampleId: "library:jungle/let-there-break",
      role: "break",
      steps: [
        createStep({
          active: true,
          slot: 3,
          pitchSemitones: -5,
          pitchCents: -486.31,
          tuningRef: { scaleId: "slendro-cents", degree: 2 },
          decay: 0.7,
          reverse: true,
          chokeGroup: "break",
          repeats: 2,
        }),
      ],
    });

    const pattern = createPattern({
      id: "pattern-1",
      name: "slot test",
      bars: 1,
      stepsPerBar: 16,
      tracks: [track],
    });

    expect(PatternSchema.parse(pattern).tracks[0]?.steps[0]).toMatchObject({
      active: true,
      slot: 3,
      pitchSemitones: -5,
      pitchCents: -486.31,
      tuningRef: { scaleId: "slendro-cents", degree: 2 },
      decay: 0.7,
      reverse: true,
      chokeGroup: "break",
      repeats: 2,
    });
  });

  it("accepts expanded sample roles on tracks", () => {
    const roles = ["break", "loop", "oneshot", "melodic", "pad", "fx"] as const;

    expect(
      roles.map((role) =>
        createTrack({
          id: role,
          name: role,
          sampleId: `library:test/${role}`,
          role,
        }).role,
      ),
    ).toEqual(roles);
  });
});

describe("stepConditionsHold", () => {
  it("supports everyN, firstOfN, and notFirstOfN", () => {
    expect(stepConditionsHold([{ type: "everyN", n: 2 }], 0)).toBe(false);
    expect(stepConditionsHold([{ type: "everyN", n: 2 }], 1)).toBe(true);
    expect(stepConditionsHold([{ type: "firstOfN", n: 4 }], 0)).toBe(true);
    expect(stepConditionsHold([{ type: "firstOfN", n: 4 }], 3)).toBe(false);
    expect(stepConditionsHold([{ type: "notFirstOfN", n: 4 }], 0)).toBe(false);
    expect(stepConditionsHold([{ type: "notFirstOfN", n: 4 }], 3)).toBe(true);
  });
});

describe("pattern round-trips", () => {
  it("accepts very slow but positive runtime BPM values", () => {
    const pattern = createPattern({
      id: "slow",
      name: "slow",
      bpm: 1,
      tracks: [
        createTrack({
          id: "track",
          name: "track",
          sampleId: "library:test",
        }),
      ],
    });

    expect(pattern.bpm).toBe(1);
  });

  it("round-trips generated valid patterns through zod", () => {
    fc.assert(
      fc.property(
        fc.record({
          bars: fc.integer({ min: 1, max: 4 }),
          stepsPerBar: fc.integer({ min: 4, max: 32 }),
          bpm: fc.integer({ min: 80, max: 190 }),
          active: fc.boolean(),
          probability: fc.float({ min: 0, max: 1, noNaN: true }),
        }),
        (input) => {
          const pattern = createPattern({
            id: "generated",
            name: "generated",
            bpm: input.bpm,
            bars: input.bars,
            stepsPerBar: input.stepsPerBar,
            tracks: [
              createTrack({
                id: "track",
                name: "track",
                sampleId: "library:test",
                steps: Array.from({ length: input.stepsPerBar }, () =>
                  createStep({
                    active: input.active,
                    probability: input.probability,
                  }),
                ),
              }),
            ],
          });

          expect(PatternSchema.parse(JSON.parse(JSON.stringify(pattern)))).toEqual(
            pattern,
          );
        },
      ),
    );
  });
});
