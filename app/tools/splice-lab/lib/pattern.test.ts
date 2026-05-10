import { describe, expect, it } from "vitest";

import {
  createSpliceLabState,
  getCellSlot,
  patternToSpliceCells,
  resizeSpliceCells,
  spliceLabToPattern,
} from "@/app/tools/splice-lab/lib/pattern";

describe("splice lab pattern bridge", () => {
  it("creates two source tracks with shared choke behavior", () => {
    const state = createSpliceLabState({
      sourceAId: "library:element-one/140-stripped-drum-loop-03",
      sourceAName: "Loop",
      sourceARole: "loop",
      sourceBId: "library:zero-g/glasychord",
      sourceBName: "Pad",
      sourceBRole: "pad",
    });
    state.cells[0] = {
      ...state.cells[0]!,
      source: "A",
      slots: { ...state.cells[0]!.slots, A: 3 },
    };
    state.cells[1] = {
      ...state.cells[1]!,
      source: "B",
      slots: { ...state.cells[1]!.slots, B: 7 },
      pitchSemitones: 5,
    };

    const pattern = spliceLabToPattern(state);

    expect(pattern.tracks).toHaveLength(2);
    expect(pattern.tracks[0]).toMatchObject({
      id: "source-a",
      sampleId: "library:element-one/140-stripped-drum-loop-03",
      role: "loop",
      chokeGroup: "splice-switch",
    });
    expect(pattern.tracks[0]?.steps[0]).toMatchObject({
      active: true,
      slot: 3,
      chokeGroup: "splice-switch",
    });
    expect(pattern.tracks[1]?.steps[1]).toMatchObject({
      active: true,
      slot: 7,
      pitchSemitones: 5,
    });
  });

  it("creates additional source tracks for multi-source splice maps", () => {
    const state = createSpliceLabState({
      sources: [
        { sampleId: "library:a", name: "A", role: "loop" },
        { sampleId: "library:b", name: "B", role: "pad" },
        { sampleId: "library:c", name: "C", role: "fx" },
      ],
    });
    state.cells[2] = {
      ...state.cells[2]!,
      source: "C",
      slots: { ...state.cells[2]!.slots, C: 5 },
    };

    const pattern = spliceLabToPattern(state);

    expect(pattern.tracks).toHaveLength(3);
    expect(pattern.tracks[2]).toMatchObject({
      id: "source-c",
      sampleId: "library:c",
      role: "fx",
    });
    expect(pattern.tracks[2]?.steps[2]).toMatchObject({
      active: true,
      slot: 5,
    });
  });

  it("projects generated source tracks back to the multi-source map", () => {
    const state = createSpliceLabState({
      sources: [
        { sampleId: "library:a", name: "A" },
        { sampleId: "library:b", name: "B" },
        { sampleId: "library:c", name: "C" },
      ],
    });
    const pattern = spliceLabToPattern(state);
    const cells = patternToSpliceCells(pattern, 16, state.sources);

    expect(cells).toHaveLength(16);
    expect(cells.some((cell) => cell.source === "A")).toBe(true);
    expect(cells.some((cell) => cell.source === "B")).toBe(true);
    expect(cells.some((cell) => cell.source === "C")).toBe(true);
  });

  it("resizes the mapping without losing source choices", () => {
    const state = createSpliceLabState({
      sourceAId: "library:a",
      sourceAName: "A",
      sourceBId: "library:b",
      sourceBName: "B",
    });
    const resized = resizeSpliceCells(state.cells, 32, state.sources);

    expect(resized).toHaveLength(32);
    expect(resized[0]?.source).toBe(state.cells[0]?.source);
    expect(getCellSlot(resized[0]!, "A", 32)).toBe(getCellSlot(state.cells[0]!, "A", 16));
  });
});
