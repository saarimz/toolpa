"use client";

import { create } from "zustand";

import {
  createDefaultDrumPattern,
  getPatternCycleLength,
  resizeTrackSteps,
} from "@/app/tools/drum-machine/lib/polyrhythm";
import {
  createGeometryTrackSteps,
  createPatternFromGeometryPlan,
  resolveGeometryPrompt,
  type GeometryPromptPlan,
} from "@/app/tools/drum-machine/lib/geometry";
import type {
  DrumSampleMode,
  DrumTrackSampleContext,
} from "@/lib/ai/contracts";
import type { Pattern, Step, Track } from "@/lib/pattern/schema";
import { PatternSchema, createStep } from "@/lib/pattern/schema";
import { getDefaultLibrarySample } from "@/lib/samples/library";

const defaultSample = getDefaultLibrarySample(["loop", "break"]);
const defaultPattern = createDefaultDrumPattern(defaultSample.id, defaultSample.name);

type DrumMachineStore = {
  sampleId: string;
  sampleName: string;
  sampleRole: Track["role"];
  sampleMode: DrumSampleMode;
  laneSampleNames: Record<string, string>;
  pattern: Pattern;
  isPlaying: boolean;
  selectedStep: { trackId: string; stepIndex: number } | null;
  ghostPatterns: Pattern[];
  geometryPlan: GeometryPromptPlan | null;
  setSample: (sampleId: string, sampleName: string, sampleRole?: Track["role"]) => void;
  setSampleMode: (sampleMode: DrumSampleMode) => void;
  setLaneSample: (
    trackId: string,
    sampleId: string,
    sampleName: string,
    sampleRole?: Track["role"],
  ) => void;
  setPattern: (pattern: Pattern) => void;
  applyGeometryPrompt: (prompt: string) => GeometryPromptPlan;
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
  setTrackEuclidean: (trackId: string, hits: number, rotation: number) => void;
  setTrackStepCount: (trackId: string, stepCount: number) => void;
  setSelectedStep: (selection: { trackId: string; stepIndex: number } | null) => void;
  setGhostPatterns: (patterns: Pattern[]) => void;
  cycleLength: () => number;
};

export const useDrumMachineStore = create<DrumMachineStore>((set, get) => ({
  sampleId: defaultSample.id,
  sampleName: defaultSample.name,
  sampleRole: defaultSample.role,
  sampleMode: "slice",
  laneSampleNames: createLaneSampleNames(defaultPattern, defaultSample.name),
  pattern: defaultPattern,
  isPlaying: false,
  selectedStep: null,
  ghostPatterns: [],
  geometryPlan: null,
  setSample(sampleId, sampleName, sampleRole = "unknown") {
    set((state) => ({
      sampleId,
      sampleName,
      sampleRole,
      laneSampleNames: Object.fromEntries(
        state.pattern.tracks.map((track) => [track.id, sampleName]),
      ),
      pattern: replaceAllTrackSamples({
        pattern: state.pattern,
        sampleId,
        sampleName,
        sampleRole,
      }),
      selectedStep: null,
      geometryPlan: null,
    }));
  },
  setSampleMode(sampleMode) {
    set((state) => {
      if (sampleMode === "slice") {
        return {
          sampleMode,
          laneSampleNames: Object.fromEntries(
            state.pattern.tracks.map((track) => [track.id, state.sampleName]),
          ),
          pattern: replaceAllTrackSamples({
            pattern: state.pattern,
            sampleId: state.sampleId,
            sampleName: state.sampleName,
            sampleRole: state.sampleRole,
          }),
          selectedStep: null,
          geometryPlan: null,
        };
      }

      return {
        sampleMode,
        laneSampleNames: {
          ...createLaneSampleNames(state.pattern, state.sampleName),
          ...state.laneSampleNames,
        },
      };
    });
  },
  setLaneSample(trackId, sampleId, sampleName, sampleRole = "unknown") {
    set((state) => {
      const laneSampleNames = {
        ...state.laneSampleNames,
        [trackId]: sampleName,
      };

      return {
        sampleMode: "multi",
        laneSampleNames,
        pattern: replaceTrackSample({
          laneSampleNames,
          pattern: state.pattern,
          sampleId,
          sampleRole,
          trackId,
        }),
        selectedStep: null,
        geometryPlan: null,
      };
    });
  },
  setPattern(pattern) {
    const parsed = PatternSchema.parse(pattern);
    set((state) => ({
      laneSampleNames: {
        ...createLaneSampleNames(parsed, state.sampleName),
        ...state.laneSampleNames,
      },
      pattern: parsed,
      geometryPlan: null,
    }));
  },
  applyGeometryPrompt(prompt) {
    const plan = resolveGeometryPrompt(prompt);
    const state = get();
    const trackSamples = getDrumTrackSamples(state.pattern, state.laneSampleNames);
    const pattern = createPatternFromGeometryPlan({
      plan,
      sampleId: state.sampleId,
      sampleName: state.sampleName,
      sampleRole: state.sampleRole,
      trackSamples: state.sampleMode === "multi" ? trackSamples : undefined,
    });
    set({
      geometryPlan: plan,
      laneSampleNames: createLaneSampleNamesFromTrackSamples(
        pattern,
        trackSamples,
        state.sampleName,
      ),
      pattern,
      selectedStep: null,
    });
    return plan;
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
      geometryPlan: null,
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
      geometryPlan: null,
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
      geometryPlan: null,
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
  setTrackEuclidean(trackId, hits, rotation) {
    set((state) => ({
      geometryPlan: null,
      pattern: {
        ...state.pattern,
        tracks: state.pattern.tracks.map((track) => {
          if (track.id !== trackId) {
            return track;
          }

          return {
            ...track,
            steps: createGeometryTrackSteps({
              hits,
              pulses: track.steps.length,
              rotation,
              slot: track.slot ?? track.steps[0]?.slot ?? 0,
              template: track.steps.find((step) => step.active) ?? track.steps[0],
            }),
          };
        }),
      },
      selectedStep: null,
    }));
  },
  setTrackStepCount(trackId, stepCount) {
    set((state) => ({
      geometryPlan: null,
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

export function getDrumTrackSamples(
  pattern: Pattern,
  laneSampleNames: Record<string, string>,
): DrumTrackSampleContext[] {
  return pattern.tracks.map((track) => ({
    trackId: track.id,
    trackName: track.name,
    sampleId: track.sampleId,
    sampleName: laneSampleNames[track.id] ?? track.sampleId,
    sampleRole: track.role,
  }));
}

function createLaneSampleNames(pattern: Pattern, sampleName: string) {
  return Object.fromEntries(
    pattern.tracks.map((track) => [track.id, sampleName]),
  );
}

function createLaneSampleNamesFromTrackSamples(
  pattern: Pattern,
  trackSamples: DrumTrackSampleContext[],
  fallbackName: string,
) {
  return Object.fromEntries(
    pattern.tracks.map((track) => {
      const sample = trackSamples.find((candidate) => candidate.trackId === track.id)
        ?? trackSamples.find((candidate) => candidate.sampleId === track.sampleId);
      return [track.id, sample?.sampleName ?? fallbackName];
    }),
  );
}

function replaceAllTrackSamples({
  pattern,
  sampleId,
  sampleName,
  sampleRole,
}: {
  pattern: Pattern;
  sampleId: string;
  sampleName: string;
  sampleRole: Track["role"];
}): Pattern {
  return PatternSchema.parse({
    ...pattern,
    tracks: pattern.tracks.map((track) => ({
      ...track,
      role: sampleRole,
      sampleId,
      steps: track.steps.map((step) =>
        createStep({
          ...step,
          sampleId: undefined,
        }),
      ),
    })),
    metadata: {
      ...pattern.metadata,
      sourceSampleId: sampleId,
      sourceSampleName: sampleName,
      sourceSampleIds: [sampleId],
      sourceSampleNames: [sampleName],
    },
  });
}

function replaceTrackSample({
  laneSampleNames,
  pattern,
  sampleId,
  sampleRole,
  trackId,
}: {
  laneSampleNames: Record<string, string>;
  pattern: Pattern;
  sampleId: string;
  sampleRole: Track["role"];
  trackId: string;
}): Pattern {
  const nextPattern = PatternSchema.parse({
    ...pattern,
    tracks: pattern.tracks.map((track) => {
      if (track.id !== trackId) {
        return track;
      }

      return {
        ...track,
        role: sampleRole,
        sampleId,
        slot: 0,
        steps: track.steps.map((step) =>
          createStep({
            ...step,
            sampleId: undefined,
            slot: 0,
          }),
        ),
      };
    }),
  });
  return withSourceSampleMetadata(nextPattern, laneSampleNames);
}

function withSourceSampleMetadata(
  pattern: Pattern,
  laneSampleNames: Record<string, string>,
): Pattern {
  const sampleIds = [...new Set(pattern.tracks.map((track) => track.sampleId))];
  const sampleNames = sampleIds.map((sampleId) => {
    const track = pattern.tracks.find((candidate) => candidate.sampleId === sampleId);
    return track ? laneSampleNames[track.id] ?? sampleId : sampleId;
  });

  return PatternSchema.parse({
    ...pattern,
    metadata: {
      ...pattern.metadata,
      sourceSampleId: sampleIds[0],
      sourceSampleName: sampleNames[0],
      sourceSampleIds: sampleIds,
      sourceSampleNames: sampleNames,
    },
  });
}
