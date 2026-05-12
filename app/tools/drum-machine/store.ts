"use client";

import { create } from "zustand";

import {
  createDefaultDrumPattern,
  getPatternCycleLength,
  resizeTrackSteps,
} from "@/app/tools/drum-machine/lib/polyrhythm";
import type { Pattern, Step, Track } from "@/lib/pattern/schema";
import { PatternSchema, createStep } from "@/lib/pattern/schema";
import { getDefaultLibrarySample } from "@/lib/samples/library";

const defaultSample = getDefaultLibrarySample(["loop", "break"]);

type DrumMachineStore = {
  sampleId: string;
  sampleName: string;
  sampleRole: Track["role"];
  pattern: Pattern;
  isPlaying: boolean;
  selectedStep: { trackId: string; stepIndex: number } | null;
  ghostPatterns: Pattern[];
  setSample: (sampleId: string, sampleName: string, sampleRole?: Track["role"]) => void;
  setPattern: (pattern: Pattern) => void;
  setPlaying: (isPlaying: boolean) => void;
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
  toggleStep: (trackId: string, stepIndex: number) => void;
  updateStep: (trackId: string, stepIndex: number, patch: Partial<Step>) => void;
  updateTrack: (
    trackId: string,
    patch: {
      mute?: boolean;
      solo?: boolean;
      slot?: number;
      pitchSemitones?: number;
      decay?: number;
    },
  ) => void;
  setTrackStepCount: (trackId: string, stepCount: number) => void;
  setSelectedStep: (selection: { trackId: string; stepIndex: number } | null) => void;
  setGhostPatterns: (patterns: Pattern[]) => void;
  cycleLength: () => number;
};

export const useDrumMachineStore = create<DrumMachineStore>((set, get) => ({
  sampleId: defaultSample.id,
  sampleName: defaultSample.name,
  sampleRole: defaultSample.role,
  pattern: createDefaultDrumPattern(defaultSample.id, defaultSample.name),
  isPlaying: false,
  selectedStep: null,
  ghostPatterns: [],
  setSample(sampleId, sampleName, sampleRole = "unknown") {
    set({
      sampleId,
      sampleName,
      sampleRole,
      pattern: createDefaultDrumPattern(sampleId, sampleName),
      selectedStep: null,
    });
  },
  setPattern(pattern) {
    set({ pattern: PatternSchema.parse(pattern) });
  },
  setPlaying(isPlaying) {
    set({ isPlaying });
  },
  setBpm(bpm) {
    set((state) => ({ pattern: { ...state.pattern, bpm } }));
  },
  setSwing(swing) {
    set((state) => ({ pattern: { ...state.pattern, swing } }));
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
                    ? { ...step, active: !step.active, slot: track.slot ?? step.slot ?? 0 }
                    : step,
                ),
              }
            : track,
        ),
      },
      selectedStep: { trackId, stepIndex },
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
                  index === stepIndex ? createStep({ ...step, ...patch }) : step,
                ),
              }
            : track,
        ),
      },
    }));
  },
  updateTrack(trackId, patch) {
    set((state) => ({
      pattern: {
        ...state.pattern,
        tracks: state.pattern.tracks.map((track) => {
          if (track.id !== trackId) {
            return track;
          }

          return {
            ...track,
            mute: patch.mute ?? track.mute,
            solo: patch.solo ?? track.solo,
            slot: patch.slot ?? track.slot,
            steps: track.steps.map((step) =>
              createStep({
                ...step,
                slot: patch.slot ?? step.slot ?? track.slot,
                pitchSemitones: patch.pitchSemitones ?? step.pitchSemitones,
                decay: patch.decay ?? step.decay,
              }),
            ),
          };
        }),
      },
    }));
  },
  setTrackStepCount(trackId, stepCount) {
    set((state) => ({
      pattern: {
        ...state.pattern,
        tracks: state.pattern.tracks.map((track) =>
          track.id === trackId ? resizeTrackSteps(track, stepCount) : track,
        ),
      },
      selectedStep: null,
    }));
  },
  setSelectedStep(selectedStep) {
    set({ selectedStep });
  },
  setGhostPatterns(patterns) {
    set({ ghostPatterns: patterns.map((pattern) => PatternSchema.parse(pattern)) });
  },
  cycleLength() {
    return getPatternCycleLength(get().pattern.tracks);
  },
}));
