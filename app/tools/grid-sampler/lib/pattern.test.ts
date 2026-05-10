import { describe, expect, it } from "vitest";

import {
  createGridSamplerState,
  gridToPattern,
  patternToGridCells,
} from "@/app/tools/grid-sampler/lib/pattern";

describe("grid sampler pattern bridge", () => {
  it("loads a sample as a full active left-to-right slice grid", () => {
    const state = createGridSamplerState("library:jungle/let-there-break", "Let There Break");

    expect(state.traversal).toBe("LR");
    expect(state.cells).toHaveLength(64);
    expect(state.cells.every((cell) => cell.active)).toBe(true);
    expect(state.cells.map((cell) => cell.slot)).toEqual(
      Array.from({ length: 64 }, (_, slot) => slot),
    );
  });

  it("maps active cells through traversal into executable steps", () => {
    const state = createGridSamplerState("library:jungle/let-there-break", "Let There Break");
    state.sliceCount = 32;
    state.traversal = "RL";
    state.cells = state.cells.slice(0, 32).map((cell) => ({ ...cell, active: false }));
    state.cells[7] = { ...state.cells[7]!, active: true, velocity: 0.5 };

    const pattern = gridToPattern(state);

    expect(pattern.bars).toBe(2);
    expect(pattern.tracks).toHaveLength(1);
    expect(pattern.tracks[0]?.steps[0]).toMatchObject({
      active: true,
      slot: 7,
      velocity: 0.5,
    });
  });

  it("can project a generated pattern back onto cells", () => {
    const state = createGridSamplerState("library:jungle/let-there-break", "Let There Break");
    state.sliceCount = 32;
    const pattern = gridToPattern(state);
    const cells = patternToGridCells(pattern, 32);

    expect(cells).toHaveLength(32);
    expect(cells.some((cell) => cell.active)).toBe(true);
  });

  it("resizes new sample-slice cells on by default", () => {
    const state = createGridSamplerState("library:jungle/let-there-break", "Let There Break");
    state.cells = state.cells.slice(0, 32);
    state.cells[1] = { ...state.cells[1]!, active: false };

    const cells = patternToGridCells(gridToPattern({ ...state, sliceCount: 32 }), 64);

    expect(cells[1]?.active).toBe(false);
    expect(cells[40]?.active).toBe(true);
  });

  it("supports compact 4, 8, and 16 slice grids without repeating cells inside the bar", () => {
    for (const sliceCount of [4, 8, 16] as const) {
      const state = createGridSamplerState(
        "library:jungle/let-there-break",
        "Let There Break",
      );
      state.sliceCount = sliceCount;
      state.cells = state.cells.slice(0, sliceCount);

      const pattern = gridToPattern(state);

      expect(pattern.tracks[0]?.steps).toHaveLength(sliceCount);
      expect(pattern.stepsPerBar).toBe(sliceCount);
      expect(pattern.bars).toBe(1);
    }
  });
});
