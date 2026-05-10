import { describe, expect, it } from "vitest";

import {
  buildGridSamplerPrompt,
  buildGridSamplerSystemPrompt,
} from "@/app/tools/grid-sampler/lib/prompt";
import { createGridSamplerState, gridToPattern } from "@/app/tools/grid-sampler/lib/pattern";
import { getLibrarySample } from "@/lib/samples/library";

describe("grid sampler prompt", () => {
  it("describes structured and tool-calling modes", () => {
    expect(buildGridSamplerSystemPrompt(false)).toContain("structured output");
    expect(buildGridSamplerSystemPrompt(true)).toContain("chop, place, audition");
    expect(buildGridSamplerSystemPrompt(false)).toContain("selected sample role");
    expect(buildGridSamplerSystemPrompt(false)).toContain("fixed audio slice");
    expect(buildGridSamplerSystemPrompt(false)).toContain("active:false");
  });

  it("includes sample, grid, traversal, and vibe context", () => {
    const state = createGridSamplerState("library:jungle/let-there-break", "Let There Break");
    const sample = { ...getLibrarySample("library:jungle/let-there-break")!, analysis: null };

    const prompt = buildGridSamplerPrompt({
      pattern: gridToPattern(state),
      sample,
      vibe: "spiral edits",
      sliceCount: 64,
      traversal: "Spiral",
    });

    expect(prompt).toContain("spiral edits");
    expect(prompt).toContain("slot numbers are source-slice identities");
    expect(prompt).toContain("grid: 64 slices, traversal Spiral");
  });

  it("keeps the default generated pattern as a full fixed-slice grid", () => {
    const state = createGridSamplerState("library:jungle/let-there-break", "Let There Break");
    const sample = { ...getLibrarySample("library:jungle/let-there-break")!, analysis: null };
    const pattern = gridToPattern(state);

    expect(pattern.tracks[0]?.steps).toHaveLength(64);
    expect(pattern.tracks[0]?.steps.every((step) => step.active)).toBe(true);
    expect(pattern.tracks[0]?.steps.map((step) => step.slot)).toEqual(
      Array.from({ length: 64 }, (_, slot) => slot),
    );
    expect(
      buildGridSamplerPrompt({
        pattern,
        sample,
        vibe: "full route",
        sliceCount: 64,
        traversal: "LR",
      }),
    ).toContain("one step per grid cell");
  });
});
