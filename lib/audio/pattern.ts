import {
  type Pattern,
  type Step,
  stepConditionsHold,
} from "@/lib/pattern/schema";
import { getScaleDegreeCents } from "@/lib/music/scale-catalog";
import type { GlobalMusicContext } from "@/lib/music/context";

export type ScheduledStepEvent = {
  trackId: string;
  trackName: string;
  sampleId: string;
  stepIndex: number;
  barIndex: number;
  timeSec: number;
  durationSec: number;
  velocity: number;
  gain: number;
  pan: number;
  slot: number;
  pitchSemitones: number;
  pitchCents: number;
  playbackRate: number;
  reverse: boolean;
  chokeGroup?: string;
  repeatIndex: number;
};

export type PatternStepTraceReason =
  | "fired"
  | "skip-cond"
  | "skip-inactive"
  | "skip-mute"
  | "skip-prob"
  | "skip-solo";

export type PatternStepTraceEvent = {
  patternId: string;
  patternName: string;
  trackId: string;
  trackName: string;
  stepIndex: number;
  stepInTrack: number;
  barIndex: number;
  timeSec: number;
  fired: boolean;
  reason: PatternStepTraceReason;
  velocity: number;
  microShift: number;
  probability: number;
  pitchCents: number;
  playbackRate: number;
  repeatCount: number;
};

export type PatternEventOptions = {
  random?: () => number;
  bars?: number;
  musicalContext?: GlobalMusicContext;
};

export type PatternPlaybackPlan = {
  events: ScheduledStepEvent[];
  traces: PatternStepTraceEvent[];
};

export function getStepDurationSec(pattern: Pick<Pattern, "bpm" | "stepsPerBar">) {
  return (60 / pattern.bpm) * (4 / pattern.stepsPerBar);
}

export function pitchToPlaybackRate(semitones: number): number {
  return 2 ** (semitones / 12);
}

export function pitchCentsToPlaybackRate(cents: number): number {
  return 2 ** (cents / 1200);
}

export function resolveStepPitchCents(
  step: Pick<Step, "pitchCents" | "pitchSemitones" | "tuningRef">,
  musicalContext?: GlobalMusicContext,
): number {
  if (typeof step.pitchCents === "number") {
    return step.pitchCents;
  }

  if (step.tuningRef) {
    return getScaleDegreeCents(
      step.tuningRef.scaleId ?? musicalContext?.key.scaleId ?? "minor",
      step.tuningRef.degree,
    );
  }

  return step.pitchSemitones * 100;
}

export function shouldTriggerStep(
  step: Pick<Step, "active" | "probability" | "conditions">,
  barIndex: number,
  random: () => number,
): boolean {
  if (!step.active) {
    return false;
  }

  if (random() > step.probability) {
    return false;
  }

  return stepConditionsHold(step.conditions, barIndex);
}

export function collectPatternPlaybackPlan(
  pattern: Pattern,
  options: PatternEventOptions = {},
): PatternPlaybackPlan {
  const random = options.random ?? Math.random;
  const bars = options.bars ?? pattern.bars;
  const totalSteps = bars * pattern.stepsPerBar;
  const stepDurationSec = getStepDurationSec(pattern);
  const hasSolo = pattern.tracks.some((track) => track.solo);
  const events: ScheduledStepEvent[] = [];
  const traces: PatternStepTraceEvent[] = [];

  for (let stepIndex = 0; stepIndex < totalSteps; stepIndex += 1) {
    const barIndex = Math.floor(stepIndex / pattern.stepsPerBar);

    for (const track of pattern.tracks) {
      if (track.mute || (hasSolo && !track.solo)) {
        const step = track.steps[stepIndex % track.steps.length];
        if (step) {
          traces.push(
            createTraceEvent({
              barIndex,
              pattern,
              reason: track.mute ? "skip-mute" : "skip-solo",
              step,
              stepDurationSec,
              stepIndex,
              track,
              musicalContext: options.musicalContext,
            }),
          );
        }
        continue;
      }

      const step = track.steps[stepIndex % track.steps.length];
      if (!step) {
        continue;
      }

      const reason = getStepTraceReason(step, barIndex, random);
      traces.push(
        createTraceEvent({
          barIndex,
          pattern,
          reason,
          step,
          stepDurationSec,
          stepIndex,
          track,
          musicalContext: options.musicalContext,
        }),
      );

      if (reason !== "fired") {
        continue;
      }

      const repeats = step.repeats;
      const repeatDurationSec = step.decay
        ? stepDurationSec * step.decay
        : stepDurationSec / repeats;
      const pitchCents = resolveStepPitchCents(step, options.musicalContext);

      for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex += 1) {
        const repeatOffsetSec = (stepDurationSec / repeats) * repeatIndex;

        events.push({
          trackId: track.id,
          trackName: track.name,
          sampleId: step.sampleId ?? track.sampleId,
          stepIndex,
          barIndex,
          timeSec: stepIndex * stepDurationSec + step.microShift * stepDurationSec + repeatOffsetSec,
          durationSec: repeatDurationSec,
          velocity: step.velocity,
          gain: track.gain,
          pan: track.pan,
          slot: step.slot ?? track.slot ?? 0,
          pitchSemitones: pitchCents / 100,
          pitchCents,
          playbackRate: step.playbackRate ?? pitchCentsToPlaybackRate(pitchCents),
          reverse: step.reverse,
          chokeGroup: step.chokeGroup ?? track.chokeGroup,
          repeatIndex,
        });
      }
    }
  }

  return {
    events: events.sort((left, right) => left.timeSec - right.timeSec),
    traces: traces.sort((left, right) => left.timeSec - right.timeSec),
  };
}

export function collectPatternEvents(
  pattern: Pattern,
  options: PatternEventOptions = {},
): ScheduledStepEvent[] {
  return collectPatternPlaybackPlan(pattern, options).events;
}

function getStepTraceReason(
  step: Pick<Step, "active" | "probability" | "conditions">,
  barIndex: number,
  random: () => number,
): PatternStepTraceReason {
  if (!step.active) {
    return "skip-inactive";
  }

  if (random() > step.probability) {
    return "skip-prob";
  }

  if (!stepConditionsHold(step.conditions, barIndex)) {
    return "skip-cond";
  }

  return "fired";
}

function createTraceEvent({
  barIndex,
  musicalContext,
  pattern,
  reason,
  step,
  stepDurationSec,
  stepIndex,
  track,
}: {
  barIndex: number;
  musicalContext?: GlobalMusicContext;
  pattern: Pattern;
  reason: PatternStepTraceReason;
  step: Step;
  stepDurationSec: number;
  stepIndex: number;
  track: Pattern["tracks"][number];
}): PatternStepTraceEvent {
  const pitchCents = resolveStepPitchCents(step, musicalContext);
  const fired = reason === "fired";

  return {
    patternId: pattern.id,
    patternName: pattern.name,
    trackId: track.id,
    trackName: track.name,
    stepIndex,
    stepInTrack: stepIndex % track.steps.length,
    barIndex,
    timeSec:
      stepIndex * stepDurationSec + (fired ? step.microShift * stepDurationSec : 0),
    fired,
    reason,
    velocity: step.velocity,
    microShift: step.microShift,
    probability: step.probability,
    pitchCents,
    playbackRate: step.playbackRate ?? pitchCentsToPlaybackRate(pitchCents),
    repeatCount: step.repeats,
  };
}
