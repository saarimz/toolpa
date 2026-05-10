"use client";

import { create } from "zustand";

import {
  createGridSamplerState,
  gridToPattern,
  patternToGridCells,
  resizeGridCells,
  type GridSamplerCell,
  type GridSamplerStateData,
} from "@/app/tools/grid-sampler/lib/pattern";
import type {
  GridSliceCount,
  TraversalMode,
} from "@/app/tools/grid-sampler/lib/traversal";
import type { Pattern, Track } from "@/lib/pattern/schema";
import { PatternSchema } from "@/lib/pattern/schema";
import { getDefaultLibrarySample } from "@/lib/samples/library";

const defaultSample = getDefaultLibrarySample(["loop", "break"]);

type GridSamplerStore = GridSamplerStateData & {
  isPlaying: boolean;
  currentStepIndex: number | null;
  agentMode: "structured" | "tool-calling";
  ghostPatterns: Pattern[];
  selectedCell: number | null;
  setSample: (sampleId: string, sampleName: string, sampleRole?: Track["role"]) => void;
  setSliceCount: (sliceCount: GridSliceCount) => void;
  setTraversal: (traversal: TraversalMode) => void;
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setPlaying: (isPlaying: boolean) => void;
  setCurrentStepIndex: (currentStepIndex: number | null) => void;
  setAgentMode: (agentMode: "structured" | "tool-calling") => void;
  toggleCell: (slot: number) => void;
  paintCell: (slot: number, active: boolean) => void;
  updateCell: (slot: number, patch: Partial<GridSamplerCell>) => void;
  setSelectedCell: (slot: number | null) => void;
  setPattern: (pattern: Pattern) => void;
  setGhostPatterns: (patterns: Pattern[]) => void;
  toPattern: () => Pattern;
};

export const useGridSamplerStore = create<GridSamplerStore>((set, get) => ({
  ...createGridSamplerState(defaultSample.id, defaultSample.name, defaultSample.role),
  isPlaying: false,
  currentStepIndex: null,
  agentMode: "structured",
  ghostPatterns: [],
  selectedCell: null,
  setSample(sampleId, sampleName, sampleRole = "unknown") {
    set({
      ...createGridSamplerState(sampleId, sampleName, sampleRole),
      selectedCell: null,
    });
  },
  setSliceCount(sliceCount) {
    set((state) => ({
      sliceCount,
      cells: resizeGridCells(state.cells, sliceCount),
      selectedCell: null,
    }));
  },
  setTraversal(traversal) {
    set({ traversal });
  },
  setBpm(bpm) {
    set({ bpm });
  },
  setSwing(swing) {
    set({ swing });
  },
  setPlaying(isPlaying) {
    set({ isPlaying });
  },
  setCurrentStepIndex(currentStepIndex) {
    set({ currentStepIndex });
  },
  setAgentMode(agentMode) {
    set({ agentMode });
  },
  toggleCell(slot) {
    set((state) => ({
      cells: state.cells.map((cell) =>
        cell.slot === slot ? { ...cell, active: !cell.active } : cell,
      ),
      selectedCell: slot,
    }));
  },
  paintCell(slot, active) {
    set((state) => ({
      cells: state.cells.map((cell) =>
        cell.slot === slot ? { ...cell, active } : cell,
      ),
    }));
  },
  updateCell(slot, patch) {
    set((state) => ({
      cells: state.cells.map((cell) =>
        cell.slot === slot ? { ...cell, ...patch, slot } : cell,
      ),
    }));
  },
  setSelectedCell(selectedCell) {
    set({ selectedCell });
  },
  setPattern(pattern) {
    const parsed = PatternSchema.parse(pattern);
    set((state) => ({
      bpm: parsed.bpm,
      swing: parsed.swing,
      cells: patternToGridCells(parsed, state.sliceCount),
    }));
  },
  setGhostPatterns(patterns) {
    set({ ghostPatterns: patterns.map((pattern) => PatternSchema.parse(pattern)) });
  },
  toPattern() {
    return gridToPattern(get());
  },
}));
