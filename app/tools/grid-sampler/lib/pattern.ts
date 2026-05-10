import {
  createPattern,
  createStep,
  createTrack,
  type Pattern,
  type Step,
  type Track,
} from "@/lib/pattern/schema";
import {
  getGridDimensions,
  traverse,
  type GridSliceCount,
  type TraversalMode,
} from "@/app/tools/grid-sampler/lib/traversal";

export type GridSamplerCell = Step & {
  slot: number;
};

export type GridSamplerStateData = {
  sourceSampleId: string;
  sourceSampleName: string;
  sourceSampleRole: Track["role"];
  sliceCount: GridSliceCount;
  traversal: TraversalMode;
  seed: string;
  bpm: number;
  swing: number;
  cells: GridSamplerCell[];
};

export function createGridSamplerState(
  sourceSampleId: string,
  sourceSampleName: string,
  sourceSampleRole: Track["role"] = "unknown",
): GridSamplerStateData {
  const sliceCount = 64;

  return {
    sourceSampleId,
    sourceSampleName,
    sourceSampleRole,
    sliceCount,
    traversal: "LR",
    seed: sourceSampleId,
    bpm: 160,
    swing: 0,
    cells: Array.from({ length: sliceCount }, (_, slot) =>
      createStep({
        active: true,
        slot,
        probability: 1,
        velocity: 1,
        microShift: 0,
      }) as GridSamplerCell,
    ),
  };
}

export function resizeGridCells(
  cells: GridSamplerCell[],
  sliceCount: GridSliceCount,
): GridSamplerCell[] {
  return Array.from({ length: sliceCount }, (_, slot) => ({
    ...createStep(cells[slot] ?? { active: true }),
    slot,
  })) as GridSamplerCell[];
}

export function gridToPattern(state: GridSamplerStateData): Pattern {
  const { rows, cols } = getGridDimensions(state.sliceCount);
  const order = traverse(rows, cols, state.traversal, state.seed);
  const steps = order.map((cellIndex) => {
    const cell = state.cells[cellIndex] ?? createStep();
    return createStep({
      ...cell,
      slot: cellIndex,
    });
  });
  const stepsPerBar = Math.min(16, steps.length);

  return createPattern({
    id: "grid-sampler-pattern",
    name: `grid ${state.sliceCount} ${state.traversal}`,
    bpm: state.bpm,
    swing: state.swing,
    bars: Math.ceil(steps.length / stepsPerBar),
    stepsPerBar,
    tracks: [
      createTrack({
        id: "grid",
        name: "grid",
        sampleId: state.sourceSampleId,
        role: state.sourceSampleRole,
        chokeGroup: "grid",
        steps,
      }),
    ],
    metadata: {
      toolSlug: "grid-sampler",
      sourceSampleId: state.sourceSampleId,
      sourceSampleName: state.sourceSampleName,
      createdBy: "manual",
      tags: ["grid", state.traversal],
    },
  });
}

export function patternToGridCells(pattern: Pattern, sliceCount: GridSliceCount) {
  const track = pattern.tracks[0];
  const cells = resizeGridCells([], sliceCount);

  if (!track) {
    return cells;
  }

  for (const step of track.steps) {
    const slot = step.slot;
    if (typeof slot === "number" && slot >= 0 && slot < cells.length) {
      cells[slot] = { ...createStep(step), slot } as GridSamplerCell;
    }
  }

  return cells;
}
