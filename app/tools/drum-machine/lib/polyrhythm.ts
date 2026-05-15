import {
  createPattern,
  createStep,
  createTrack,
  type Pattern,
  type Track,
} from "@/lib/pattern/schema";

export const DrumStepCounts = [5, 7, 8, 9, 11, 12, 13, 15, 16, 24, 32] as const;

export type DrumTrackConfig = {
  trackId: string;
  stepCount: number;
  pitch: number;
  decay: number;
  voiceMode: "mono" | "poly";
};

export function gcd(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function lcm(left: number, right: number): number {
  return Math.abs(left * right) / gcd(left, right);
}

export function getPatternCycleLength(tracks: Pick<Track, "steps">[]) {
  return tracks.reduce((cycle, track) => lcm(cycle, track.steps.length), 1);
}

export function createDefaultDrumPattern(
  sampleId: string,
  sampleName = "sample-sliced kit",
): Pattern {
  return createPattern({
    id: "drum-machine-default",
    name: "drum machine init",
    bpm: 138,
    swing: 0.16,
    bars: 4,
    stepsPerBar: 16,
    tracks: [
      createDrumTrack("kick", sampleId, 0, 16, [0, 8], "kick"),
      createDrumTrack("snare", sampleId, 1, 16, [4, 12], "snare"),
      createDrumTrack("hat", sampleId, 2, 12, [0, 2, 4, 6, 8, 10], "hat"),
      createDrumTrack("perc", sampleId, 3, 13, [2, 6, 9, 12], "perc"),
    ],
    metadata: {
      toolSlug: "drum-machine",
      sourceSampleId: sampleId,
      sourceSampleName: sampleName,
      createdBy: "manual",
      tags: ["drums", "polyrhythm"],
    },
  });
}

export function createDrumTrack(
  id: string,
  sampleId: string,
  slot: number,
  stepCount: number,
  activeSteps: number[],
  name = id,
) {
  return createTrack({
    id,
    name,
    sampleId,
    role: "oneshot",
    slot,
    chokeGroup: id === "hat" ? "hats" : id,
    steps: Array.from({ length: stepCount }, (_, index) =>
      createStep({
        active: activeSteps.includes(index),
        slot,
        velocity: id === "hat" ? 0.55 : 1,
        decay: id === "kick" ? 0.9 : id === "hat" ? 0.35 : 0.55,
        pitchSemitones: id === "perc" ? -2 : 0,
      }),
    ),
  });
}

export function resizeTrackSteps(track: Track, stepCount: number): Track {
  return createTrack({
    ...track,
    steps: Array.from({ length: stepCount }, (_, index) =>
      createStep(track.steps[index] ?? { active: false, slot: track.slot }),
    ),
  });
}
