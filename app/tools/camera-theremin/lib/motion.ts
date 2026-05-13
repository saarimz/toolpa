import { getScaleDefinition, getScaleDegreeCents } from "@/lib/music/scale-catalog";
import type { Tonic } from "@/lib/music/context";

export type MotionLandmark = {
  x: number;
  y: number;
  z?: number;
};

export type TrackingMode = "body" | "eyes" | "face" | "gestures" | "hands";

export type MotionConnection = readonly [number, number];

export type HandMotionFrame = {
  connections?: readonly MotionConnection[];
  gesture?: string | null;
  handedness: string | null;
  label?: string;
  landmarks: MotionLandmark[];
  pinch: number;
  role?: "pitch" | "volume";
  score: number | null;
  source: TrackingMode;
  x: number;
  y: number;
  z: number;
};

export type ThereminHandsFrame = {
  hands: HandMotionFrame[];
  source: TrackingMode;
  pitchHand: HandMotionFrame | null;
  volumeHand: HandMotionFrame | null;
};

export type ScaleLockSettings = {
  chordCycle?: ChordCycleMode;
  chordMode?: ChordMode;
  degreeSpan: number;
  octaveShift: number;
  referenceFrequency: number;
  scaleId: string;
  tonic: Tonic;
  volumeHand?: HandMotionFrame | null;
};

export type ChordCycleMode = "cadence" | "modal" | "static" | "walk";

export type ChordMode = "fifth" | "mono" | "seventh" | "sus4" | "triad";

export type QuantizedThereminNote = {
  brightness: number;
  chordCycle: ChordCycleMode;
  chordCycleIndex: number;
  chordCycleLabel: string;
  chordDegrees: number[];
  chordLabel: string;
  chordMode: ChordMode;
  chordRootDegree: number;
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
  connections?: readonly MotionConnection[];
  gesture?: string | null;
  handedness?: string | null;
  label?: string;
  landmarks: MotionLandmark[];
  role?: "pitch" | "volume";
  score?: number | null;
  source?: TrackingMode;
};

type CreateMotionPointFrameInput = {
  connections?: readonly MotionConnection[];
  gesture?: string | null;
  handedness?: string | null;
  label?: string;
  landmarks?: MotionLandmark[];
  pinch?: number;
  role?: "pitch" | "volume";
  score?: number | null;
  source: TrackingMode;
  x: number;
  y: number;
  z?: number;
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

const chordCyclePatterns = {
  cadence: [
    { label: "I", offset: 0 },
    { label: "V", offset: 4 },
    { label: "vi", offset: 5 },
    { label: "IV", offset: 3 },
  ],
  modal: [
    { label: "home", offset: 0 },
    { label: "second", offset: 1 },
    { label: "fourth", offset: 3 },
    { label: "fifth", offset: 4 },
  ],
  static: [{ label: "static", offset: 0 }],
  walk: [
    { label: "1", offset: 0 },
    { label: "2", offset: 1 },
    { label: "3", offset: 2 },
    { label: "4", offset: 3 },
  ],
} as const satisfies Record<
  ChordCycleMode,
  readonly { label: string; offset: number }[]
>;

export function createHandMotionFrame({
  connections,
  gesture = null,
  handedness = null,
  label,
  landmarks,
  role,
  score = null,
  source = "hands",
}: CreateHandMotionFrameInput): HandMotionFrame | null {
  const indexTip = landmarks[8];
  const thumbTip = landmarks[4];
  if (!indexTip || !thumbTip) {
    return null;
  }

  return {
    connections,
    gesture,
    handedness,
    label,
    landmarks,
    pinch: round(distance(indexTip, thumbTip), 4),
    role,
    score,
    source,
    x: clamp01(indexTip.x),
    y: clamp01(indexTip.y),
    z: normalizeDepth(indexTip.z ?? 0),
  };
}

export function createMotionPointFrame({
  connections,
  gesture = null,
  handedness = null,
  label,
  landmarks = [],
  pinch = 0.16,
  role,
  score = null,
  source,
  x,
  y,
  z = 0,
}: CreateMotionPointFrameInput): HandMotionFrame {
  return {
    connections,
    gesture,
    handedness,
    label,
    landmarks,
    pinch: round(clamp(pinch, 0, 0.36), 4),
    role,
    score,
    source,
    x: clamp01(x),
    y: clamp01(y),
    z: normalizeDepth(z),
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

export function createThereminHandsFrame(
  hands: HandMotionFrame[],
  source: TrackingMode = "hands",
): ThereminHandsFrame | null {
  const trackedHands = hands.slice(0, 2);
  if (trackedHands.length === 0) {
    return null;
  }

  const rightHand = trackedHands.find((hand) => isHandedness(hand, "right"));
  const leftHand = trackedHands.find((hand) => isHandedness(hand, "left"));
  const screenSorted = [...trackedHands].sort((left, right) => left.x - right.x);
  const pitchHand =
    rightHand ?? screenSorted[screenSorted.length - 1] ?? trackedHands[0] ?? null;
  const volumeHand =
    leftHand && leftHand !== pitchHand
      ? leftHand
      : trackedHands.length > 1
        ? screenSorted.find((hand) => hand !== pitchHand) ?? null
        : null;

  return {
    hands: trackedHands,
    source,
    pitchHand,
    volumeHand,
  };
}

export function createThereminMotionFrame({
  points,
  source,
}: {
  points: HandMotionFrame[];
  source: TrackingMode;
}): ThereminHandsFrame | null {
  const trackedPoints = points.slice(0, 2);
  if (trackedPoints.length === 0) {
    return null;
  }

  const pitchPoint =
    trackedPoints.find((point) => point.role === "pitch") ??
    trackedPoints[0] ??
    null;
  const volumePoint =
    trackedPoints.find((point) => point.role === "volume" && point !== pitchPoint) ??
    trackedPoints.find((point) => point !== pitchPoint) ??
    null;

  return {
    hands: trackedPoints,
    source,
    pitchHand: pitchPoint,
    volumeHand: volumePoint,
  };
}

export function smoothThereminHandsFrame(
  previous: ThereminHandsFrame | null,
  next: ThereminHandsFrame,
  smoothing: number,
): ThereminHandsFrame {
  const pitchHand = next.pitchHand
    ? smoothHandMotionFrame(previous?.pitchHand ?? null, next.pitchHand, smoothing)
    : null;
  const volumeHand = next.volumeHand
    ? smoothHandMotionFrame(
        previous?.volumeHand ?? null,
        next.volumeHand,
        smoothing,
      )
    : null;

  return {
    hands: next.hands.map((hand) => {
      if (hand === next.pitchHand && pitchHand) {
        return pitchHand;
      }
      if (hand === next.volumeHand && volumeHand) {
        return volumeHand;
      }
      return hand;
    }),
    source: next.source,
    pitchHand,
    volumeHand,
  };
}

export function quantizeMotionToScale(
  frame: HandMotionFrame,
  settings: ScaleLockSettings,
): QuantizedThereminNote {
  const scale = getScaleDefinition(settings.scaleId);
  const chordMode = settings.chordMode ?? "mono";
  const chordCycle =
    chordMode === "mono" ? "static" : (settings.chordCycle ?? "static");
  const degreeSpan = Math.max(1, Math.round(settings.degreeSpan));
  const pitchPosition = clamp01(1 - frame.y);
  const degree = Math.round(pitchPosition * degreeSpan);
  const chordCycleStep = getChordCycleStep(
    chordCycle,
    settings.volumeHand?.x ?? frame.x,
  );
  const chordRootDegree = degree + chordCycleStep.offset;
  const degreeCents = getScaleDegreeCents(scale.id, degree);
  const rootFrequency =
    getTonicFrequency(settings.tonic, settings.referenceFrequency) *
    2 ** settings.octaveShift;
  const frequency = round(rootFrequency * 2 ** (degreeCents / 1200), 3);
  const chordDegrees = chordDegreeOffsets[chordMode].map(
    (offset) => chordRootDegree + offset,
  );
  const frequencies = chordDegrees.map((chordDegree) =>
    round(
      rootFrequency * 2 ** (getScaleDegreeCents(scale.id, chordDegree) / 1200),
      3,
    ),
  );
  const nearestSemitone = Math.round(degreeCents / 100);
  const detuneCents = round(degreeCents - nearestSemitone * 100, 2);
  const volume = settings.volumeHand
    ? mapVolumeHandToLevel(settings.volumeHand)
    : round(clamp((frame.pinch - 0.035) / 0.18, 0, 1), 3);
  const brightnessHand = settings.volumeHand;
  const brightness = round(
    clamp01(
      brightnessHand
        ? frame.x * 0.5 +
            frame.z * 0.18 +
            brightnessHand.x * 0.2 +
            brightnessHand.z * 0.12
        : frame.x * 0.78 + frame.z * 0.22,
    ),
    3,
  );
  const filterHz = Math.round(420 + brightness ** 1.7 * 7600);
  const pan = round(clamp((frame.x - 0.5) * 1.6, -0.8, 0.8), 3);

  return {
    brightness,
    chordCycle,
    chordCycleIndex: chordCycleStep.index,
    chordCycleLabel: formatChordCycleLabel(chordCycle, chordCycleStep.label),
    chordDegrees,
    chordLabel:
      chordMode === "mono"
        ? formatDegreeLabel(degree)
        : [
            formatDegreeLabel(chordRootDegree),
            chordCycle === "static"
              ? null
              : formatChordCycleLabel(chordCycle, chordCycleStep.label),
            formatChordMode(chordMode),
          ]
            .filter(Boolean)
            .join(" "),
    chordMode,
    chordRootDegree,
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

function getChordCycleStep(chordCycle: ChordCycleMode, position: number) {
  const pattern = chordCyclePatterns[chordCycle];
  const index =
    pattern.length <= 1
      ? 0
      : Math.min(pattern.length - 1, Math.floor(clamp01(position) * pattern.length));
  const step = pattern[index] ?? pattern[0];

  return {
    index,
    label: step.label,
    offset: step.offset,
  };
}

export function mapVolumeHandToLevel(frame: HandMotionFrame) {
  const liftedAwayFromLoop = clamp((0.86 - frame.y) / 0.62, 0, 1);
  const openHandArticulation = clamp((frame.pinch - 0.035) / 0.2, 0, 1);

  return round(
    clamp(liftedAwayFromLoop * 0.82 + openHandArticulation * 0.18, 0, 1),
    3,
  );
}

export function getTonicFrequency(tonic: Tonic, referenceFrequency = 440) {
  const rootMidi = 60 + (tonicPitchClasses[tonic] ?? 0);
  return round(referenceFrequency * 2 ** ((rootMidi - 69) / 12), 3);
}

function isHandedness(frame: HandMotionFrame, handedness: "left" | "right") {
  return frame.handedness?.toLowerCase() === handedness;
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

function formatChordCycleLabel(chordCycle: ChordCycleMode, stepLabel: string) {
  if (chordCycle === "static") {
    return "static";
  }

  return `${chordCycle} ${stepLabel}`;
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
