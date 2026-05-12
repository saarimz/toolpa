import type { ChordMode } from "@/app/tools/camera-theremin/lib/motion";

export type CameraThereminControlState = {
  chordMode: ChordMode;
  degreeSpan: number;
  octaveShift: number;
  smoothing: number;
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
  const degreeSpan = getPromptDegreeSpan(lower) ?? current.degreeSpan;
  const octaveShift = getPromptOctaveShift(lower) ?? current.octaveShift;
  const smoothing = getPromptSmoothing(lower) ?? current.smoothing;

  return {
    chordMode,
    degreeSpan,
    octaveShift,
    smoothing,
    summary: `${chordMode} / ${degreeSpan + 1} notes / ${formatOctave(octaveShift)} / ${Math.round(smoothing * 100)}%`,
  };
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

function formatOctave(octaveShift: number) {
  if (octaveShift <= -2) {
    return "low";
  }
  if (octaveShift >= 0) {
    return "high";
  }

  return "mid";
}
