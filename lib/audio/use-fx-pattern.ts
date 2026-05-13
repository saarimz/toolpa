"use client";

import { create } from "zustand";

import {
  DEFAULT_FX_PATTERN,
  updateFxSlotProbability,
  updateFxSlotParam,
  updateFxSlot,
  type FxProbability,
  type FxKind,
  type FxPattern,
  type FxParameterValue,
  type FxSlotId,
} from "@/lib/audio/fx-manifest";

type FxPatternStore = {
  patterns: Record<string, FxPattern>;
  resetFxPattern: (toolId: string) => void;
  setFxSlotEffect: (toolId: string, slotId: FxSlotId, effect: FxKind) => void;
  setFxSlotProbability: (
    toolId: string,
    slotId: FxSlotId,
    patch: Partial<FxProbability>,
  ) => void;
  setFxSlotParam: (
    toolId: string,
    slotId: FxSlotId,
    key: string,
    value: FxParameterValue,
  ) => void;
  setFxSlotWet: (toolId: string, slotId: FxSlotId, wet: number) => void;
};

export const useFxPatternStore = create<FxPatternStore>((set) => ({
  patterns: {},
  resetFxPattern(toolId) {
    set((state) => {
      const next = { ...state.patterns };
      delete next[toolId];
      return { patterns: next };
    });
  },
  setFxSlotEffect(toolId, slotId, effect) {
    set((state) => ({
      patterns: {
        ...state.patterns,
        [toolId]: updateFxSlot(
          state.patterns[toolId] ?? DEFAULT_FX_PATTERN,
          slotId,
          { effect },
        ),
      },
    }));
  },
  setFxSlotProbability(toolId, slotId, patch) {
    set((state) => ({
      patterns: {
        ...state.patterns,
        [toolId]: updateFxSlotProbability(
          state.patterns[toolId] ?? DEFAULT_FX_PATTERN,
          slotId,
          patch,
        ),
      },
    }));
  },
  setFxSlotParam(toolId, slotId, key, value) {
    set((state) => ({
      patterns: {
        ...state.patterns,
        [toolId]: updateFxSlotParam(
          state.patterns[toolId] ?? DEFAULT_FX_PATTERN,
          slotId,
          key,
          value,
        ),
      },
    }));
  },
  setFxSlotWet(toolId, slotId, wet) {
    set((state) => ({
      patterns: {
        ...state.patterns,
        [toolId]: updateFxSlot(
          state.patterns[toolId] ?? DEFAULT_FX_PATTERN,
          slotId,
          { wet },
        ),
      },
    }));
  },
}));

export function useToolFxPattern(toolId: string): FxPattern {
  return useFxPatternStore(
    (state) => state.patterns[toolId] ?? DEFAULT_FX_PATTERN,
  );
}
