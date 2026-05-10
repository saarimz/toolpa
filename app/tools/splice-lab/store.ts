"use client";

import { create } from "zustand";

import {
  createSpliceLabState,
  patternToSpliceCells,
  resizeSpliceCells,
  spliceLabToPattern,
  SpliceSourceKeys,
  type SpliceCell,
  type SpliceLabSource,
  type SpliceLabStateData,
  type SpliceSliceCount,
  type SpliceSource,
} from "@/app/tools/splice-lab/lib/pattern";
import type { Pattern, Track } from "@/lib/pattern/schema";
import { PatternSchema } from "@/lib/pattern/schema";
import { getDefaultLibrarySample, getLibrarySamplesByRoles } from "@/lib/samples/library";

const defaultA = getDefaultLibrarySample(["loop", "break"]);
const defaultB = getDefaultLibrarySample(["pad", "melodic", "fx", "loop"]);
const addableDefaults = getLibrarySamplesByRoles([
  "break",
  "loop",
  "oneshot",
  "melodic",
  "pad",
  "fx",
]);

type SpliceLabStore = SpliceLabStateData & {
  isPlaying: boolean;
  currentStepIndex: number | null;
  selectedStep: number | null;
  ghostPatterns: Pattern[];
  setSource: (key: string, id: string, name: string, role?: Track["role"]) => void;
  addSource: () => void;
  removeSource: (key: string) => void;
  setSliceCount: (sliceCount: SpliceSliceCount) => void;
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setPlaybackRate: (playbackRate: number) => void;
  setPlaying: (isPlaying: boolean) => void;
  setCurrentStepIndex: (step: number | null) => void;
  setSelectedStep: (step: number | null) => void;
  cycleCellSource: (step: number) => void;
  setCellSource: (step: number, source: SpliceSource) => void;
  updateCell: (step: number, patch: Partial<SpliceCell>) => void;
  updateCellSlot: (step: number, sourceKey: string, slot: number) => void;
  setPattern: (pattern: Pattern) => void;
  setGhostPatterns: (patterns: Pattern[]) => void;
  toPattern: () => Pattern;
};

export const useSpliceLabStore = create<SpliceLabStore>((set, get) => ({
  ...createSpliceLabState({
    sources: [
      { sampleId: defaultA.id, name: defaultA.name, role: defaultA.role },
      { sampleId: defaultB.id, name: defaultB.name, role: defaultB.role },
    ],
  }),
  isPlaying: false,
  currentStepIndex: null,
  selectedStep: null,
  ghostPatterns: [],
  setSource(key, id, name, role = "unknown") {
    set((state) => ({
      sources: state.sources.map((source) =>
        source.key === key ? { ...source, sampleId: id, name, role } : source,
      ),
    }));
  },
  addSource() {
    set((state) => {
      if (state.sources.length >= SpliceSourceKeys.length) {
        return state;
      }

      const nextDefault =
        addableDefaults[state.sources.length % addableDefaults.length] ?? defaultA;
      const sources = [
        ...state.sources,
        {
          key: SpliceSourceKeys[state.sources.length]!,
          sampleId: nextDefault.id,
          name: nextDefault.name,
          role: nextDefault.role,
        },
      ];

      return {
        sources,
        cells: resizeSpliceCells(state.cells, state.sliceCount, sources),
      };
    });
  },
  removeSource(key) {
    set((state) => {
      const lastSource = state.sources[state.sources.length - 1];
      if (state.sources.length <= 2 || lastSource?.key !== key) {
        return state;
      }

      const sources = state.sources.slice(0, -1);

      return {
        sources,
        cells: resizeSpliceCells(state.cells, state.sliceCount, sources),
        selectedStep: null,
      };
    });
  },
  setSliceCount(sliceCount) {
    set((state) => ({
      sliceCount,
      cells: resizeSpliceCells(state.cells, sliceCount, state.sources),
      selectedStep: null,
    }));
  },
  setBpm(bpm) {
    set({ bpm });
  },
  setSwing(swing) {
    set({ swing });
  },
  setPlaybackRate(playbackRate) {
    set({ playbackRate });
  },
  setPlaying(isPlaying) {
    set({ isPlaying });
  },
  setCurrentStepIndex(currentStepIndex) {
    set({ currentStepIndex });
  },
  setSelectedStep(selectedStep) {
    set({ selectedStep });
  },
  cycleCellSource(step) {
    set((state) => ({
      cells: state.cells.map((cell) =>
        cell.step === step
          ? { ...cell, source: getNextSource(cell.source, state.sources) }
          : cell,
      ),
      selectedStep: step,
    }));
  },
  setCellSource(step, source) {
    set((state) => ({
      cells: state.cells.map((cell) =>
        cell.step === step ? { ...cell, source } : cell,
      ),
      selectedStep: step,
    }));
  },
  updateCell(step, patch) {
    set((state) => ({
      cells: state.cells.map((cell) =>
        cell.step === step ? { ...cell, ...patch, step } : cell,
      ),
    }));
  },
  updateCellSlot(step, sourceKey, slot) {
    set((state) => ({
      cells: state.cells.map((cell) =>
        cell.step === step
          ? { ...cell, slots: { ...cell.slots, [sourceKey]: slot } }
          : cell,
      ),
    }));
  },
  setPattern(pattern) {
    const parsed = PatternSchema.parse(pattern);
    set((state) => ({
      bpm: parsed.bpm,
      swing: parsed.swing,
      cells: patternToSpliceCells(parsed, state.sliceCount, state.sources),
    }));
  },
  setGhostPatterns(patterns) {
    set({ ghostPatterns: patterns.map((pattern) => PatternSchema.parse(pattern)) });
  },
  toPattern() {
    return spliceLabToPattern(get());
  },
}));

function getNextSource(current: SpliceSource, sources: SpliceLabSource[]): SpliceSource {
  if (current === "rest") {
    return sources[0]?.key ?? "rest";
  }

  const index = sources.findIndex((source) => source.key === current);
  return sources[index + 1]?.key ?? "rest";
}
