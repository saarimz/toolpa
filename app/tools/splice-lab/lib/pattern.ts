import {
  createPattern,
  createStep,
  createTrack,
  type Pattern,
  type Step,
  type Track,
} from "@/lib/pattern/schema";

export const SpliceSourceKeys = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;
export const SpliceSources = ["rest", ...SpliceSourceKeys] as const;
export const SpliceSliceCounts = [8, 16, 32, 64] as const;

export type SpliceSourceKey = (typeof SpliceSourceKeys)[number];
export type SpliceSource = "rest" | SpliceSourceKey;
export type SpliceSliceCount = (typeof SpliceSliceCounts)[number];

export type SpliceLabSource = {
  key: SpliceSourceKey;
  sampleId: string;
  name: string;
  role: Track["role"];
};

export type SpliceCell = Pick<
  Step,
  "velocity" | "probability" | "microShift" | "pitchSemitones" | "decay" | "reverse" | "repeats"
> & {
  step: number;
  source: SpliceSource;
  slots: Record<string, number>;
};

export type SpliceLabStateData = {
  sources: SpliceLabSource[];
  sliceCount: SpliceSliceCount;
  bpm: number;
  swing: number;
  playbackRate: number;
  cells: SpliceCell[];
};

export function createSpliceLabState({
  sources,
  sourceAId,
  sourceAName,
  sourceARole = "unknown",
  sourceBId,
  sourceBName,
  sourceBRole = "unknown",
}: {
  sources?: Array<{
    sampleId: string;
    name: string;
    role?: Track["role"];
  }>;
  sourceAId?: string;
  sourceAName?: string;
  sourceARole?: Track["role"];
  sourceBId?: string;
  sourceBName?: string;
  sourceBRole?: Track["role"];
}): SpliceLabStateData {
  const sliceCount = 16;
  const normalizedSources = normalizeSources(
    sources ??
      [
        {
          sampleId: sourceAId ?? "source-a",
          name: sourceAName ?? "source A",
          role: sourceARole,
        },
        {
          sampleId: sourceBId ?? "source-b",
          name: sourceBName ?? "source B",
          role: sourceBRole,
        },
      ],
  );

  return {
    sources: normalizedSources,
    sliceCount,
    bpm: 132,
    swing: 0.08,
    playbackRate: 1,
    cells: Array.from({ length: sliceCount }, (_, step) =>
      createSpliceCell({
        step,
        source: getDefaultSourceForStep(step, normalizedSources),
        slots: createDefaultSlots(step, sliceCount, normalizedSources),
        velocity: step % 8 === 0 ? 1 : 0.82,
        probability: step % 7 === 0 ? 0.8 : 1,
        microShift: step % 6 === 0 ? -0.04 : 0,
        pitchSemitones: step % 8 === 6 ? 7 : 0,
        decay: step % 4 === 0 ? 0.9 : 0.55,
        reverse: step % 11 === 0,
        repeats: 1,
      }),
    ),
  };
}

export function createSpliceCell(overrides: Partial<SpliceCell> & { step: number }): SpliceCell {
  return {
    step: overrides.step,
    source: overrides.source ?? "rest",
    slots: overrides.slots ?? {},
    velocity: overrides.velocity ?? 1,
    probability: overrides.probability ?? 1,
    microShift: overrides.microShift ?? 0,
    pitchSemitones: overrides.pitchSemitones ?? 0,
    decay: overrides.decay,
    reverse: overrides.reverse ?? false,
    repeats: overrides.repeats ?? 1,
  };
}

export function resizeSpliceCells(
  cells: SpliceCell[],
  sliceCount: SpliceSliceCount,
  sources: SpliceLabSource[],
): SpliceCell[] {
  return Array.from({ length: sliceCount }, (_, step) => {
    const existing = cells[step];
    const source = existing?.source && sourceExists(existing.source, sources)
      ? existing.source
      : getDefaultSourceForStep(step, sources);

    return createSpliceCell({
      ...(existing ?? {}),
      step,
      source,
      slots: createDefaultSlots(step, sliceCount, sources, existing?.slots),
    });
  });
}

export function spliceLabToPattern(state: SpliceLabStateData): Pattern {
  const tracks = state.sources.map((source) => {
    const steps = state.cells.map((cell) =>
      createStep({
        active: cell.source === source.key,
        slot: getCellSlot(cell, source.key, state.sliceCount),
        velocity: cell.velocity,
        probability: cell.probability,
        microShift: cell.microShift,
        pitchSemitones: cell.pitchSemitones,
        decay: cell.decay,
        reverse: cell.reverse,
        repeats: cell.repeats,
        chokeGroup: "splice-switch",
      }),
    );

    return createTrack({
      id: getTrackId(source.key),
      name: `source ${source.key}: ${source.name}`,
      sampleId: source.sampleId,
      role: source.role,
      chokeGroup: "splice-switch",
      steps,
    });
  });

  return createPattern({
    id: "splice-lab-pattern",
    name: "splice lab loop",
    bpm: state.bpm,
    swing: state.swing,
    bars: Math.ceil(state.cells.length / 16),
    stepsPerBar: 16,
    tracks,
    metadata: {
      toolSlug: "splice-lab",
      sourceSampleId: state.sources[0]?.sampleId,
      sourceSampleName: state.sources[0]?.name,
      sourceSampleIds: state.sources.map((source) => source.sampleId),
      sourceSampleNames: state.sources.map((source) => source.name),
      createdBy: "manual",
      tags: ["splice", "multi-source", "sample"],
    },
  });
}

export function patternToSpliceCells(
  pattern: Pattern,
  sliceCount: SpliceSliceCount,
  sources: SpliceLabSource[],
) {
  const tracksByKey = new Map(
    sources.map((source, index) => [
      source.key,
      pattern.tracks.find((track) => track.id === getTrackId(source.key)) ??
        pattern.tracks.find((track) => track.sampleId === source.sampleId) ??
        pattern.tracks[index],
    ]),
  );

  return Array.from({ length: sliceCount }, (_, step) => {
    let selectedStep: Step | null = null;
    let selectedSource: SpliceSource = "rest";
    const slots = createDefaultSlots(step, sliceCount, sources);

    for (const source of sources) {
      const track = tracksByKey.get(source.key);
      const trackStep = track?.steps[step % (track.steps.length || 1)];
      if (trackStep) {
        slots[source.key] = trackStep.slot ?? step % sliceCount;
      }

      if (trackStep?.active && selectedSource === "rest") {
        selectedSource = source.key;
        selectedStep = trackStep;
      }
    }

    return createSpliceCell({
      step,
      source: selectedSource,
      slots,
      velocity: selectedStep?.velocity ?? 1,
      probability: selectedStep?.probability ?? 1,
      microShift: selectedStep?.microShift ?? 0,
      pitchSemitones: selectedStep?.pitchSemitones ?? 0,
      decay: selectedStep?.decay,
      reverse: selectedStep?.reverse ?? false,
      repeats: selectedStep?.repeats ?? 1,
    });
  });
}

export function getCellSlot(
  cell: Pick<SpliceCell, "slots" | "step">,
  sourceKey: SpliceSourceKey,
  sliceCount: number,
) {
  return clampSlot(cell.slots[sourceKey] ?? cell.step, sliceCount);
}

export function getTrackId(sourceKey: SpliceSourceKey) {
  return `source-${sourceKey.toLowerCase()}`;
}

export function normalizeSources(
  inputSources: Array<{
    sampleId: string;
    name: string;
    role?: Track["role"];
  }>,
): SpliceLabSource[] {
  return inputSources.slice(0, SpliceSourceKeys.length).map((source, index) => ({
    key: SpliceSourceKeys[index]!,
    sampleId: source.sampleId,
    name: source.name,
    role: source.role ?? "unknown",
  }));
}

function createDefaultSlots(
  step: number,
  sliceCount: SpliceSliceCount,
  sources: SpliceLabSource[],
  existing: Record<string, number> = {},
) {
  return Object.fromEntries(
    sources.map((source, index) => [
      source.key,
      clampSlot(existing[source.key] ?? step * (index + 1), sliceCount),
    ]),
  );
}

function getDefaultSourceForStep(step: number, sources: SpliceLabSource[]): SpliceSource {
  if (sources.length === 0 || step % 4 === 1) {
    return "rest";
  }

  return sources[step % sources.length]?.key ?? "rest";
}

function sourceExists(source: SpliceSource, sources: SpliceLabSource[]) {
  return source === "rest" || sources.some((candidate) => candidate.key === source);
}

function clampSlot(value: number, sliceCount: number) {
  return Math.max(0, Math.min(sliceCount - 1, Math.round(value) % sliceCount));
}
