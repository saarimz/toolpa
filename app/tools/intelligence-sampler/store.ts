"use client";

import { create } from "zustand";

import { createIntelligenceSamplerPattern } from "@/lib/pattern/defaults";
import type { SliceRegion } from "@/lib/audio/slices";
import type { Pattern, Step, Track } from "@/lib/pattern/schema";
import { PatternSchema } from "@/lib/pattern/schema";
import { getDefaultLibrarySample } from "@/lib/samples/library";

const defaultSample = getDefaultLibrarySample(["loop", "pad", "melodic", "fx", "oneshot", "break"]);

type IntelligenceSamplerState = {
  sampleId: string;
  sampleName: string;
  sampleRole: Track["role"];
  detectedBpm: number | null;
  sliceMode: "equal" | "onset";
  slices: SliceRegion[];
  isPlaying: boolean;
  pattern: Pattern;
  ghostPatterns: Pattern[];
  selectedStep: { trackId: string; stepIndex: number } | null;
  setSample: (sampleId: string, sampleName: string, sampleRole?: Track["role"]) => void;
  setDetectedBpm: (bpm: number | null) => void;
  setSliceMode: (sliceMode: "equal" | "onset") => void;
  setSlices: (slices: SliceRegion[]) => void;
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  setPattern: (pattern: Pattern) => void;
  setGhostPatterns: (patterns: Pattern[]) => void;
  setPlaying: (isPlaying: boolean) => void;
  toggleStep: (trackId: string, stepIndex: number) => void;
  updateTrack: (
    trackId: string,
    patch: {
      chokeGroup?: string | undefined;
    },
  ) => void;
  updateStep: (
    trackId: string,
    stepIndex: number,
    patch: Partial<Step>,
  ) => void;
  setSelectedStep: (selection: { trackId: string; stepIndex: number } | null) => void;
};

export const useIntelligenceSamplerStore = create<IntelligenceSamplerState>((set) => ({
  sampleId: defaultSample.id,
  sampleName: defaultSample.name,
  sampleRole: defaultSample.role,
  detectedBpm: null,
  sliceMode: "equal",
  slices: [],
  isPlaying: false,
  pattern: createIntelligenceSamplerPattern(defaultSample.id, defaultSample.name, defaultSample.role),
  ghostPatterns: [],
  selectedStep: null,
  setSample(sampleId, sampleName, sampleRole = "unknown") {
    set({
      sampleId,
      sampleName,
      sampleRole,
      pattern: createIntelligenceSamplerPattern(sampleId, sampleName, sampleRole),
      detectedBpm: null,
      sliceMode: "equal",
      slices: [],
      selectedStep: null,
    });
  },
  setDetectedBpm(bpm) {
    set({ detectedBpm: bpm });
  },
  setSliceMode(sliceMode) {
    set({ sliceMode });
  },
  setSlices(slices) {
    set({ slices });
  },
  setBpm(bpm) {
    set((state) => ({ pattern: { ...state.pattern, bpm } }));
  },
  setSwing(swing) {
    set((state) => ({ pattern: { ...state.pattern, swing } }));
  },
  setPattern(pattern) {
    set({ pattern: PatternSchema.parse(pattern) });
  },
  setGhostPatterns(patterns) {
    set({ ghostPatterns: patterns.map((pattern) => PatternSchema.parse(pattern)) });
  },
  setPlaying(isPlaying) {
    set({ isPlaying });
  },
  toggleStep(trackId, stepIndex) {
    set((state) => ({
      pattern: {
        ...state.pattern,
        tracks: state.pattern.tracks.map((track) =>
          track.id === trackId
            ? {
                ...track,
                steps: track.steps.map((step, index) =>
                  index === stepIndex
                    ? {
                        ...step,
                        active: !step.active,
                        slot: track.slot ?? step.slot ?? 0,
                      }
                    : step,
                ),
              }
            : track,
        ),
      },
      selectedStep: { trackId, stepIndex },
    }));
  },
  updateTrack(trackId, patch) {
    set((state) => ({
      pattern: {
        ...state.pattern,
        tracks: state.pattern.tracks.map((track) =>
          track.id === trackId ? { ...track, ...patch } : track,
        ),
      },
    }));
  },
  updateStep(trackId, stepIndex, patch) {
    set((state) => ({
      pattern: {
        ...state.pattern,
        tracks: state.pattern.tracks.map((track) =>
          track.id === trackId
            ? {
                ...track,
                steps: track.steps.map((step, index) =>
                  index === stepIndex ? { ...step, ...patch } : step,
                ),
              }
            : track,
        ),
      },
    }));
  },
  setSelectedStep(selectedStep) {
    set({ selectedStep });
  },
}));
