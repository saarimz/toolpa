import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  GridSliceCounts,
  getTraversalCellAtStep,
  getTraversalPositions,
  getGridDimensions,
  traverse,
  TraversalModes,
} from "@/app/tools/grid-sampler/lib/traversal";

describe("grid traversal", () => {
  it("maps supported slice counts to dimensions", () => {
    expect(getGridDimensions(4)).toEqual({ rows: 2, cols: 2 });
    expect(getGridDimensions(8)).toEqual({ rows: 2, cols: 4 });
    expect(getGridDimensions(16)).toEqual({ rows: 4, cols: 4 });
    expect(getGridDimensions(32)).toEqual({ rows: 4, cols: 8 });
    expect(getGridDimensions(64)).toEqual({ rows: 8, cols: 8 });
    expect(getGridDimensions(128)).toEqual({ rows: 8, cols: 16 });
    expect(getGridDimensions(256)).toEqual({ rows: 16, cols: 16 });
  });

  it("covers every cell exactly once for every traversal", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...GridSliceCounts),
        fc.constantFrom(...TraversalModes),
        fc.string(),
        (sliceCount, mode, seed) => {
          const { rows, cols } = getGridDimensions(sliceCount);
          const order = traverse(rows, cols, mode, seed);
          expect(order).toHaveLength(rows * cols);
          expect(new Set(order).size).toBe(rows * cols);
          expect(Math.min(...order)).toBe(0);
          expect(Math.max(...order)).toBe(rows * cols - 1);
        },
      ),
    );
  });

  it("is deterministic for seeded random traversal", () => {
    expect(traverse(4, 8, "Random", "amen")).toEqual(
      traverse(4, 8, "Random", "amen"),
    );
    expect(traverse(4, 8, "Random", "amen")).not.toEqual(
      traverse(4, 8, "Random", "apache"),
    );
  });

  it("tracks the visible cell from the traversal step", () => {
    expect(getTraversalCellAtStep(32, "LR", 0)).toBe(0);
    expect(getTraversalCellAtStep(32, "LR", 7)).toBe(7);
    expect(getTraversalCellAtStep(32, "RL", 0)).toBe(7);
    expect(getTraversalCellAtStep(32, "RL", 7)).toBe(0);
    expect(getTraversalCellAtStep(32, "Diagonal", 1)).toBe(1);
    expect(getTraversalCellAtStep(32, "Diagonal", 2)).toBe(8);
  });

  it("reports traversal positions for fixed sample-slice cells", () => {
    const positions = getTraversalPositions(32, "RL");

    expect(positions.get(7)).toBe(0);
    expect(positions.get(0)).toBe(7);
    expect(positions.get(31)).toBe(24);
  });
});
