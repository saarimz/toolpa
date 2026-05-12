import { afterEach, describe, expect, it } from "vitest";

import {
  clearAdHocScaleDefinitions,
  getAdHocScaleDefinitions,
  getScaleDefinition,
  getScaleDegreeCents,
  getScaleKeys,
  getScalePitchOffsets,
  getScaleSemitoneApproximation,
  registerAdHocScaleDefinition,
  resolveScaleKey,
  searchScaleKeys,
} from "@/lib/music/scale-catalog";

describe("scale catalog", () => {
  afterEach(() => {
    clearAdHocScaleDefinitions();
  });

  it("expands curated scales across enough tonics for hundreds of keys", () => {
    const keys = getScaleKeys();

    expect(keys.length).toBeGreaterThanOrEqual(500);
    expect(keys.map((key) => key.id)).toContain("C:minor");
    expect(keys.map((key) => key.id)).toContain("F#:quarter-tone-chromatic");
  });

  it("finds exotic, jazz, modal, and microtonal scales from natural search text", () => {
    expect(searchScaleKeys("persian exotic dark", { tonic: "C", limit: 1 })[0]?.id).toBe(
      "C:persian",
    );
    expect(searchScaleKeys("bebop dominant", { tonic: "D", limit: 1 })[0]?.id).toBe(
      "D:bebop-dominant",
    );
    expect(searchScaleKeys("dub dorian modal", { tonic: "F", limit: 1 })[0]?.id).toBe(
      "F:dorian",
    );
    expect(
      searchScaleKeys("quarter tone chromatic microtonal", { tonic: "A", limit: 1 })[0]?.id,
    ).toBe("A:quarter-tone-chromatic");
  });

  it("resolves unknown scale ids back to the default minor scale", () => {
    expect(resolveScaleKey({ tonic: "Bb", scaleId: "missing" })).toMatchObject({
      id: "Bb:minor",
      tonic: "Bb",
      scale: { id: "minor" },
    });
  });

  it("exposes cents and semitone approximations for synth consumers", () => {
    expect(getScaleSemitoneApproximation("dorian")).toEqual([0, 2, 3, 5, 7, 9, 10]);

    const offsets = getScalePitchOffsets("quarter-tone-neutral");
    expect(offsets[1]).toMatchObject({
      cents: 150,
      semitone: 2,
      detuneCents: -50,
    });

    expect(getScaleDefinition("just-major")?.microtonal).toBe(true);
  });

  it("resolves scale degrees across tuning systems and octaves", () => {
    expect(getScaleDegreeCents("dorian", 2)).toBe(300);
    expect(getScaleDegreeCents("slendro-cents", 2)).toBe(480);
    expect(getScaleDegreeCents("quarter-tone-neutral", 1)).toBe(150);
    expect(getScaleDegreeCents("just-major", 2)).toBeCloseTo(386.314);
    expect(getScaleDegreeCents("dorian", 8)).toBe(1400);
    expect(getScaleDegreeCents("dorian", -1)).toBe(-200);
  });

  it("registers tool-generated ad-hoc scales for global context consumers", () => {
    const registered = registerAdHocScaleDefinition({
      aliases: ["tool triad"],
      description: "A tool-generated C minor triad scale.",
      family: "tool ad-hoc",
      id: "tool-c-minor-triad",
      microtonal: false,
      name: "Tool C minor triad",
      source: "curated",
      tags: ["tool-generated", "evidence"],
      tuning: {
        kind: "12tet",
        intervals: [0, 3, 7],
        periodCents: 1200,
      },
    });

    expect(registered.source).toBe("tool-generated");
    expect(getAdHocScaleDefinitions()).toHaveLength(1);
    expect(getScaleDefinition("tool-c-minor-triad")).toMatchObject({
      name: "Tool C minor triad",
      source: "tool-generated",
    });
    expect(getScaleSemitoneApproximation("tool-c-minor-triad")).toEqual([0, 3, 7]);
    expect(resolveScaleKey({ tonic: "C", scaleId: "tool-c-minor-triad" })).toMatchObject({
      id: "C:tool-c-minor-triad",
      scale: { id: "tool-c-minor-triad" },
    });
  });
});
