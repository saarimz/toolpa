import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getDefaultLibrarySample,
  getLibrarySample,
  getLibrarySamples,
  LibrarySampleSchema,
} from "@/lib/samples/library";

describe("library samples", () => {
  it("contains a validated multi-pack sample library", () => {
    const samples = getLibrarySamples();

    expect(samples.length).toBeGreaterThanOrEqual(80);
    expect(samples.every((sample) => LibrarySampleSchema.safeParse(sample).success)).toBe(
      true,
    );
    expect(getLibrarySamples("break").every((sample) => sample.role === "break")).toBe(
      true,
    );
    expect(new Set(samples.map((sample) => sample.role))).toEqual(
      new Set(["break", "loop", "oneshot", "melodic", "pad", "fx"]),
    );
    expect(new Set(samples.map((sample) => sample.pack)).size).toBeGreaterThanOrEqual(
      10,
    );
  });

  it("publishes the curated suite across genres and sample types", () => {
    const samples = getLibrarySamples().filter((sample) =>
      sample.id.startsWith("library:curated/"),
    );

    expect(samples.length).toBe(54);
    expect(new Set(samples.map((sample) => sample.id)).size).toBe(samples.length);
    expect(new Set(samples.map((sample) => sample.href)).size).toBe(samples.length);
    expect(new Set(samples.map((sample) => sample.genre))).toEqual(
      new Set([
        "ambient-experimental",
        "cinematic-fx",
        "club-house",
        "jungle-dnb",
        "uk-dubstep",
        "vocal-world",
      ]),
    );
    expect([...new Set(samples.map((sample) => sample.kind))].sort()).toEqual(
      expect.arrayContaining([
        "amen-break",
        "bass-hit",
        "bass-loop",
        "drum-break",
        "drum-hit",
        "drum-loop",
        "fx-hit",
        "fx-texture",
        "melodic-hit",
        "melodic-loop",
        "pad-drone",
        "percussion-loop",
        "top-loop",
        "vocal-phrase",
      ]),
    );
    expect(
      samples.every((sample) => sample.sourcePath && sample.tags && sample.tags.length > 0),
    ).toBe(true);

    const missingAssets = samples
      .filter(
        (sample) =>
          !existsSync(join(process.cwd(), "public", sample.href.replace(/^\//, ""))),
      )
      .map((sample) => sample.href);

    expect(missingAssets).toEqual([]);
  });

  it("looks up samples by stable id", () => {
    expect(getLibrarySample("library:jungle/let-there-break")?.href).toBe(
      "/samples/jungle-jungle/let-there-break.wav",
    );
    expect(getLibrarySample("library:zero-g/glasychord")).toMatchObject({
      role: "pad",
      href: "/samples/expanded-library/zero-g-ambient/glasychord.wav",
    });
    expect(getLibrarySample("missing")).toBeNull();
  });

  it("honors role priority when selecting defaults", () => {
    expect(getDefaultLibrarySample(["loop", "break"])).toMatchObject({
      id: "library:element-one/140-stripped-drum-loop-03",
      role: "loop",
    });
  });
});
