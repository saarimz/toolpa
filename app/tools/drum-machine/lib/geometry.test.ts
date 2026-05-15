import { describe, expect, it } from "vitest";

import {
  createEuclideanSequence,
  createPatternFromGeometryPlan,
  getFullIntervalVector,
  getInterOnsetIntervals,
  getOffBeatness,
  hasRhythmicOddity,
  resolveGeometryPrompt,
  sequenceToOnsets,
  summarizeTrackGeometry,
} from "@/app/tools/drum-machine/lib/geometry";

describe("drum-machine geometry", () => {
  it("generates Toussaint Euclidean rhythm examples", () => {
    expect(sequenceToOnsets(createEuclideanSequence({ hits: 3, pulses: 8 }))).toEqual([
      0, 3, 6,
    ]);
    expect(sequenceToOnsets(createEuclideanSequence({ hits: 5, pulses: 8 }))).toEqual([
      0, 2, 3, 5, 6,
    ]);
    expect(sequenceToOnsets(createEuclideanSequence({ hits: 5, pulses: 16 }))).toEqual([
      0, 3, 6, 9, 12,
    ]);
  });

  it("resolves a bossa nova prompt into the rotated E(5,16) necklace", () => {
    const plan = resolveGeometryPrompt("make a bossa nova swing rhythm encoded in geometry");
    const timeline = plan.tracks[0];

    expect(plan.name).toContain("bossa");
    expect(timeline).toMatchObject({
      algorithm: "euclidean",
      hits: 5,
      pulses: 16,
      rotation: 10,
    });
    expect(sequenceToOnsets(createEuclideanSequence({
      hits: timeline.hits,
      pulses: timeline.pulses,
      rotation: timeline.rotation,
    }))).toEqual([0, 3, 6, 10, 13]);
    expect(plan.rationale).toContain("cyclic geometry");
  });

  it("computes interval, oddity, and off-beatness metrics for clave son", () => {
    const claveSon = [0, 3, 6, 10, 12];

    expect(getInterOnsetIntervals(claveSon, 16)).toEqual([3, 3, 4, 2, 4]);
    expect(getFullIntervalVector(claveSon, 16)).toEqual([0, 1, 2, 2, 0, 3, 2, 0]);
    expect(getOffBeatness(claveSon, 16)).toBe(1);
    expect(hasRhythmicOddity(claveSon, 16)).toBe(true);
  });

  it("serializes a geometry plan into the shared Pattern schema", () => {
    const plan = resolveGeometryPrompt("E(5,16) rotate 10 with swing");
    const pattern = createPatternFromGeometryPlan({
      plan,
      sampleId: "library:jungle/let-there-break",
      sampleName: "Let There Break",
      sampleRole: "break",
    });
    const summary = summarizeTrackGeometry(pattern.tracks[0]!);

    expect(pattern.metadata.rationale).toContain("E(5,16)");
    expect(pattern.tracks).toHaveLength(5);
    expect(pattern.tracks[0]?.sampleId).toBe("library:jungle/let-there-break");
    expect(summary.formula).toBe("E(5,16) r10");
  });

  it("can preserve lane samples while serializing geometry plans", () => {
    const plan = resolveGeometryPrompt("bossa nova");
    const pattern = createPatternFromGeometryPlan({
      plan,
      sampleId: "library:fallback",
      sampleName: "Fallback",
      sampleRole: "break",
      trackSamples: [
        {
          sampleId: "library:kick",
          sampleName: "Kick",
          sampleRole: "oneshot",
          trackId: "kick",
        },
        {
          sampleId: "library:snare",
          sampleName: "Snare",
          sampleRole: "oneshot",
          trackId: "snare",
        },
        {
          sampleId: "library:hat",
          sampleName: "Hat",
          sampleRole: "oneshot",
          trackId: "hat",
        },
        {
          sampleId: "library:perc",
          sampleName: "Perc",
          sampleRole: "oneshot",
          trackId: "perc",
        },
      ],
    });
    const byId = new Map(pattern.tracks.map((track) => [track.id, track]));

    expect(byId.get("kick")?.sampleId).toBe("library:kick");
    expect(byId.get("snare")?.sampleId).toBe("library:snare");
    expect(byId.get("hat")?.sampleId).toBe("library:hat");
    expect(byId.get("timeline")?.sampleId).toBe("library:perc");
    expect(pattern.metadata.sourceSampleIds).toEqual([
      "library:perc",
      "library:kick",
      "library:snare",
      "library:hat",
    ]);
  });
});
