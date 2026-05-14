"use client";

import { getScaleDegreeCents } from "@/lib/music/scale-catalog";
import { MIN_BPM, type Tonic } from "@/lib/music/context";

export type ScaleAuditionChoice = {
  referenceFrequency?: number;
  scaleId: string;
  tonic: Tonic;
};

export type ScaleAuditionOptions = {
  bpm?: number;
  degreeCount?: number;
  noteDurationSec?: number;
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

export async function auditionScaleChoice(
  choice: ScaleAuditionChoice,
  options: ScaleAuditionOptions = {},
) {
  const Tone = await import("tone");
  await Tone.start();

  const frequencies = getScalePreviewFrequencies(choice, options);
  if (frequencies.length === 0) {
    return;
  }

  const bpm = options.bpm ?? 120;
  const noteDurationSec = options.noteDurationSec ?? 60 / Math.max(MIN_BPM, bpm);
  const stepSec = noteDurationSec * 0.55;
  const now = Tone.now();
  const synth = new Tone.Synth({
    envelope: {
      attack: 0.01,
      decay: 0.08,
      sustain: 0.32,
      release: 0.18,
    },
    oscillator: { type: "triangle" },
  }).toDestination();

  frequencies.forEach((frequency, index) => {
    synth.triggerAttackRelease(frequency, noteDurationSec * 0.5, now + index * stepSec);
  });
  synth.triggerAttackRelease(
    frequencies[0] ?? 220,
    noteDurationSec * 0.85,
    now + frequencies.length * stepSec,
  );

  window.setTimeout(
    () => synth.dispose(),
    Math.ceil((frequencies.length * stepSec + noteDurationSec + 0.4) * 1000),
  );
}

export function getScalePreviewFrequencies(
  choice: ScaleAuditionChoice,
  { degreeCount = 7 }: ScaleAuditionOptions = {},
) {
  const rootFrequency = getTonicFrequency(
    choice.tonic,
    choice.referenceFrequency ?? 440,
  );

  return Array.from({ length: Math.max(1, degreeCount) }, (_, degree) =>
    roundFrequency(
      rootFrequency * 2 ** (getScaleDegreeCents(choice.scaleId, degree) / 1200),
    ),
  );
}

export function getTonicFrequency(tonic: Tonic, referenceFrequency = 440) {
  const rootMidi = 60 + (tonicPitchClasses[tonic] ?? 0);
  return roundFrequency(referenceFrequency * 2 ** ((rootMidi - 69) / 12));
}

function roundFrequency(value: number) {
  return Math.round(value * 1000) / 1000;
}
