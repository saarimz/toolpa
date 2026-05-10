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

    expect(samples.length).toBeGreaterThanOrEqual(20);
    expect(samples.every((sample) => LibrarySampleSchema.safeParse(sample).success)).toBe(
      true,
    );
    expect(getLibrarySamples("break").every((sample) => sample.role === "break")).toBe(
      true,
    );
    expect(new Set(samples.map((sample) => sample.role))).toEqual(
      new Set(["break", "loop", "oneshot", "melodic", "pad", "fx"]),
    );
    expect(new Set(samples.map((sample) => sample.pack)).size).toBeGreaterThanOrEqual(4);
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
