import type {
  ChordCycleMode,
  ChordMode,
  TrackingMode,
} from "@/app/tools/camera-theremin/lib/motion";

export type CameraThereminControlState = {
  chordCycle: ChordCycleMode;
  chordMode: ChordMode;
  degreeSpan: number;
  octaveShift: number;
  smoothing: number;
  trackingMode: TrackingMode;
};

export type CameraThereminPromptResult = CameraThereminControlState & {
  summary: string;
};

export function applyThereminPromptToControls(
  prompt: string,
  current: CameraThereminControlState,
): CameraThereminPromptResult {
  const lower = prompt.toLowerCase();
  const chordMode = getPromptChordMode(lower) ?? current.chordMode;
  const chordCycle = getPromptChordCycle(lower) ?? current.chordCycle;
  const degreeSpan = getPromptDegreeSpan(lower) ?? current.degreeSpan;
  const octaveShift = getPromptOctaveShift(lower) ?? current.octaveShift;
  const smoothing = getPromptSmoothing(lower) ?? current.smoothing;
  const trackingMode = getPromptTrackingMode(lower) ?? current.trackingMode;

  return {
    chordCycle,
    chordMode,
    degreeSpan,
    octaveShift,
    smoothing,
    trackingMode,
    summary: `${formatTrackingMode(trackingMode)} / ${chordMode} / ${formatChordCycle(chordCycle)} / ${degreeSpan + 1} notes / ${formatOctave(octaveShift)} / ${Math.round(smoothing * 100)}%`,
  };
}

function getPromptTrackingMode(prompt: string): TrackingMode | null {
  if (/\b(eye|eyes|gaze|iris|blink|stare|look)\b/.test(prompt)) {
    return "eyes";
  }
  if (/\b(face|facial|mouth|smile|jaw|head|expression|eyebrow)\b/.test(prompt)) {
    return "face";
  }
  if (/\b(body|pose|dance|dancer|conductor|shoulder|torso|wrist|arms?)\b/.test(prompt)) {
    return "body";
  }
  if (/\b(gesture|fist|palm|thumb|victory|sign|open hand|closed hand)\b/.test(prompt)) {
    return "gestures";
  }
  if (/\b(hand|hands|finger|fingers|pinch)\b/.test(prompt)) {
    return "hands";
  }

  return null;
}

function getPromptChordMode(prompt: string): ChordMode | null {
  if (/\b(mono|single|solo|lead)\b/.test(prompt)) {
    return "mono";
  }
  if (/\b(seventh|7th|jazz|extended)\b/.test(prompt)) {
    return "seventh";
  }
  if (/\b(sus|sus4|suspended)\b/.test(prompt)) {
    return "sus4";
  }
  if (/\b(power|fifth|5th|dyad)\b/.test(prompt)) {
    return "fifth";
  }
  if (/\b(chord|triad|harmony|harmonic)\b/.test(prompt)) {
    return "triad";
  }

  return null;
}

function getPromptChordCycle(prompt: string): ChordCycleMode | null {
  if (/\b(static|same chord|hold chord|drone chord|no progression)\b/.test(prompt)) {
    return "static";
  }
  if (/\b(cadence|progression|sequence|cycle|songlike|musical)\b/.test(prompt)) {
    return "cadence";
  }
  if (/\b(walk|walking|stepwise|passing|climb|rising)\b/.test(prompt)) {
    return "walk";
  }
  if (/\b(modal|float|floating|open|suspended movement)\b/.test(prompt)) {
    return "modal";
  }

  return null;
}

function getPromptDegreeSpan(prompt: string) {
  if (/\b(wide|huge|three octave|3 octave|sweeping)\b/.test(prompt)) {
    return 28;
  }
  if (/\b(two octave|2 octave|broad)\b/.test(prompt)) {
    return 21;
  }
  if (/\b(narrow|simple|small|one octave|1 octave)\b/.test(prompt)) {
    return 7;
  }

  return null;
}

function getPromptOctaveShift(prompt: string) {
  if (/\b(sub|bass|low|deep)\b/.test(prompt)) {
    return -2;
  }
  if (/\b(high|treble|top|piercing)\b/.test(prompt)) {
    return 0;
  }
  if (/\b(mid|middle)\b/.test(prompt)) {
    return -1;
  }

  return null;
}

function getPromptSmoothing(prompt: string) {
  if (/\b(smooth|legato|slow|drone|bowed|glide)\b/.test(prompt)) {
    return 0.68;
  }
  if (/\b(fast|snappy|pluck|percussive|tight|responsive)\b/.test(prompt)) {
    return 0.2;
  }

  return null;
}

function formatChordCycle(chordCycle: ChordCycleMode) {
  if (chordCycle === "static") {
    return "static cycle";
  }
  if (chordCycle === "walk") {
    return "walking cycle";
  }

  return `${chordCycle} cycle`;
}

function formatOctave(octaveShift: number) {
  if (octaveShift <= -2) {
    return "low";
  }
  if (octaveShift >= 0) {
    return "high";
  }

  return "mid";
}

function formatTrackingMode(trackingMode: TrackingMode) {
  if (trackingMode === "gestures") {
    return "gesture tracking";
  }
  if (trackingMode === "face") {
    return "face tracking";
  }
  if (trackingMode === "eyes") {
    return "eye tracking";
  }
  if (trackingMode === "body") {
    return "body tracking";
  }

  return "hand tracking";
}
