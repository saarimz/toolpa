import { getScaleDefinition, getScaleDegreeCents } from "@/lib/music/scale-catalog";
import type { Tonic } from "@/lib/music/context";

export type MotionLandmark = {
  x: number;
  y: number;
  z?: number;
};

export type HandMotionFrame = {
  handedness: string | null;
  landmarks: MotionLandmark[];
  pinch: number;
  score: number | null;
  x: number;
  y: number;
  z: number;
};

export type ScaleLockSettings = {
  chordMode?: ChordMode;
  degreeSpan: number;
  octaveShift: number;
  referenceFrequency: number;
  scaleId: string;
  tonic: Tonic;
};

export type ChordMode = "fifth" | "mono" | "seventh" | "sus4" | "triad";

export type QuantizedThereminNote = {
  brightness: number;
  chordDegrees: number[];
  chordLabel: string;
  chordMode: ChordMode;
  degree: number;
  degreeLabel: string;
  detuneCents: number;
  filterHz: number;
  frequencies: number[];
  frequency: number;
  noteLabel: string;
  pan: number;
  scaleLabel: string;
  volume: number;
  x: number;
  y: number;
  z: number;
};

type CreateHandMotionFrameInput = {
  handedness?: string | null;
  landmarks: MotionLandmark[];
  score?: number | null;
};

const tonicPitchClasses: Record<Tonic, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

const chordDegreeOffsets = {
  fifth: [0, 4],
  mono: [0],
  seventh: [0, 2, 4, 6],
  sus4: [0, 3, 4],
  triad: [0, 2, 4],
} as const satisfies Record<ChordMode, readonly number[]>;

export function createHandMotionFrame({
  handedness = null,
  landmarks,
  score = null,
}: CreateHandMotionFrameInput): HandMotionFrame | null {
  const indexTip = landmarks[8];
  const thumbTip = landmarks[4];
  if (!indexTip || !thumbTip) {
    return null;
  }

  return {
    handedness,
    landmarks,
    pinch: round(distance(indexTip, thumbTip), 4),
    score,
    x: clamp01(indexTip.x),
    y: clamp01(indexTip.y),
    z: normalizeDepth(indexTip.z ?? 0),
  };
}

export function smoothHandMotionFrame(
  previous: HandMotionFrame | null,
  next: HandMotionFrame,
  smoothing: number,
): HandMotionFrame {
  if (!previous) {
    return next;
  }

  const hold = clamp(smoothing, 0, 0.95);
  const move = 1 - hold;

  return {
    ...next,
    pinch: round(previous.pinch * hold + next.pinch * move, 4),
    x: round(previous.x * hold + next.x * move, 4),
    y: round(previous.y * hold + next.y * move, 4),
    z: round(previous.z * hold + next.z * move, 4),
  };
}

export function quantizeMotionToScale(
  frame: HandMotionFrame,
  settings: ScaleLockSettings,
): QuantizedThereminNote {
  const scale = getScaleDefinition(settings.scaleId);
  const chordMode = settings.chordMode ?? "mono";
  const degreeSpan = Math.max(1, Math.round(settings.degreeSpan));
  const pitchPosition = clamp01(1 - frame.y);
  const degree = Math.round(pitchPosition * degreeSpan);
  const degreeCents = getScaleDegreeCents(scale.id, degree);
  const rootFrequency =
    getTonicFrequency(settings.tonic, settings.referenceFrequency) *
    2 ** settings.octaveShift;
  const frequency = round(rootFrequency * 2 ** (degreeCents / 1200), 3);
  const chordDegrees = chordDegreeOffsets[chordMode].map((offset) => degree + offset);
  const frequencies = chordDegrees.map((chordDegree) =>
    round(
      rootFrequency * 2 ** (getScaleDegreeCents(scale.id, chordDegree) / 1200),
      3,
    ),
  );
  const nearestSemitone = Math.round(degreeCents / 100);
  const detuneCents = round(degreeCents - nearestSemitone * 100, 2);
  const volume = round(clamp((frame.pinch - 0.035) / 0.18, 0, 1), 3);
  const brightness = round(clamp01(frame.x * 0.78 + frame.z * 0.22), 3);
  const filterHz = Math.round(420 + brightness ** 1.7 * 7600);
  const pan = round(clamp((frame.x - 0.5) * 1.6, -0.8, 0.8), 3);

  return {
    brightness,
    chordDegrees,
    chordLabel:
      chordMode === "mono"
        ? formatDegreeLabel(degree)
        : `${formatDegreeLabel(degree)} ${formatChordMode(chordMode)}`,
    chordMode,
    degree,
    degreeLabel: formatDegreeLabel(degree),
    detuneCents,
    filterHz,
    frequencies,
    frequency,
    noteLabel: `${settings.tonic} ${scale.name} ${formatDegreeLabel(degree)}`,
    pan,
    scaleLabel: `${settings.tonic} ${scale.name}`,
    volume,
    x: frame.x,
    y: frame.y,
    z: frame.z,
  };
}

export function getTonicFrequency(tonic: Tonic, referenceFrequency = 440) {
  const rootMidi = 60 + (tonicPitchClasses[tonic] ?? 0);
  return round(referenceFrequency * 2 ** ((rootMidi - 69) / 12), 3);
}

function normalizeDepth(z: number) {
  return round(clamp((0.16 - z) / 0.42, 0, 1), 4);
}

function formatDegreeLabel(degree: number) {
  return `degree ${degree + 1}`;
}

function formatChordMode(chordMode: ChordMode) {
  if (chordMode === "sus4") {
    return "sus4";
  }

  return chordMode;
}

function distance(left: MotionLandmark, right: MotionLandmark) {
  const zLeft = left.z ?? 0;
  const zRight = right.z ?? 0;
  return Math.sqrt(
    (left.x - right.x) ** 2 +
      (left.y - right.y) ** 2 +
      (zLeft - zRight) ** 2,
  );
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function round(value: number, precision: number) {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}
