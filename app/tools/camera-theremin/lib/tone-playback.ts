import type { QuantizedThereminNote } from "@/app/tools/camera-theremin/lib/motion";

export type CameraThereminPatch = {
  delayFeedback: number;
  delayTimeSec: number;
  oscillatorType: "sawtooth" | "sine" | "square" | "triangle";
  reverbDecay: number;
  reverbWet: number;
  release: number;
};

type ToneModule = typeof import("tone");
type ToneSynth = import("tone").Synth;
type ToneFilter = import("tone").Filter;
type ToneFeedbackDelay = import("tone").FeedbackDelay;
type ToneGain = import("tone").Gain;
type ToneLimiter = import("tone").Limiter;
type TonePanner = import("tone").Panner;
type ToneReverb = import("tone").Reverb;

type ActiveCameraThereminSynth = {
  delay: ToneFeedbackDelay;
  engagedVoices: boolean[];
  filter: ToneFilter;
  gain: ToneGain;
  limiter: ToneLimiter;
  panner: TonePanner;
  reverb: ToneReverb;
  synths: ToneSynth[];
  Tone: ToneModule;
};

const maxChordVoices = 4;
let activeSynth: ActiveCameraThereminSynth | null = null;

export async function startCameraThereminSynth({
  bpm,
  prompt,
}: {
  bpm: number;
  prompt: string;
}) {
  if (activeSynth) {
    return;
  }

  const Tone = await import("tone");
  await Tone.start();
  const patch = createCameraThereminPatch({ bpm, prompt });

  const synths = Array.from(
    { length: maxChordVoices },
    () =>
      new Tone.Synth({
        envelope: {
          attack: 0.025,
          decay: 0.12,
          release: patch.release,
          sustain: 0.72,
        },
        oscillator: {
          type: patch.oscillatorType,
        },
        portamento: 0.035,
      }),
  );
  const filter = new Tone.Filter(1800, "lowpass");
  const panner = new Tone.Panner(0);
  const delay = new Tone.FeedbackDelay({
    delayTime: patch.delayTimeSec,
    feedback: patch.delayFeedback,
    wet: 0.14,
  });
  const reverb = new Tone.Reverb({
    decay: patch.reverbDecay,
    preDelay: 0.02,
    wet: patch.reverbWet,
  });
  const gain = new Tone.Gain(0);
  const limiter = new Tone.Limiter(-1);

  for (const synth of synths) {
    synth.connect(filter);
  }
  filter.chain(panner, delay, reverb, gain, limiter, Tone.getDestination());
  activeSynth = {
    delay,
    engagedVoices: synths.map(() => false),
    filter,
    gain,
    limiter,
    panner,
    reverb,
    synths,
    Tone,
  };
}

export function createCameraThereminPatch({
  bpm,
  prompt,
}: {
  bpm: number;
  prompt: string;
}): CameraThereminPatch {
  const lower = prompt.toLowerCase();
  const beatSec = 60 / clamp(bpm, 40, 260);
  const glassy = /\b(glassy?|bell|crystal|ice|choir)\b/.test(lower);
  const gritty = /\b(grit|noise|acid|saw|bright|brass)\b/.test(lower);
  const hollow = /\b(square|hollow|reed|nasal)\b/.test(lower);
  const dubby = /\b(dub|echo|delay|space|ambient)\b/.test(lower);
  const slow = /\b(slow|legato|bow|drone|long)\b/.test(lower);

  return {
    delayFeedback: dubby ? 0.34 : 0.22,
    delayTimeSec: round(beatSec * (dubby ? 0.75 : 0.5), 3),
    oscillatorType: gritty
      ? "sawtooth"
      : hollow
        ? "square"
        : glassy
          ? "triangle"
          : "sine",
    reverbDecay: dubby || slow ? 3.4 : 2.2,
    reverbWet: dubby || glassy ? 0.24 : 0.16,
    release: slow ? 0.42 : 0.24,
  };
}

export function updateCameraThereminSynth(note: QuantizedThereminNote | null) {
  if (!activeSynth) {
    return;
  }

  const now = activeSynth.Tone.now();
  const frequencies = note?.frequencies.slice(0, maxChordVoices) ?? [];
  if (!note || note.volume <= 0.02) {
    activeSynth.gain.gain.rampTo(0, 0.05);
    releaseUnusedVoices(activeSynth, 0, now + 0.04);
    return;
  }

  activeSynth.filter.frequency.rampTo(note.filterHz, 0.08);
  activeSynth.gain.gain.rampTo(0.04 + note.volume * 0.42, 0.045);
  activeSynth.panner.pan.rampTo(note.pan, 0.08);

  frequencies.forEach((frequency, index) => {
    const synth = activeSynth?.synths[index];
    if (!activeSynth || !synth) {
      return;
    }
    if (activeSynth.engagedVoices[index]) {
      synth.setNote(frequency, now);
    } else {
      synth.triggerAttack(frequency, now);
      activeSynth.engagedVoices[index] = true;
    }
  });
  releaseUnusedVoices(activeSynth, frequencies.length, now + 0.04);
}

function releaseUnusedVoices(
  synth: ActiveCameraThereminSynth,
  startIndex: number,
  time: number,
) {
  for (let index = startIndex; index < synth.synths.length; index += 1) {
    if (synth.engagedVoices[index]) {
      synth.synths[index]?.triggerRelease(time);
      synth.engagedVoices[index] = false;
    }
  }
}

export async function stopCameraThereminSynth() {
  if (!activeSynth) {
    return;
  }

  const synth = activeSynth;
  activeSynth = null;
  releaseUnusedVoices(synth, 0, synth.Tone.now());
  window.setTimeout(() => {
    for (const voice of synth.synths) {
      voice.dispose();
    }
    synth.filter.dispose();
    synth.panner.dispose();
    synth.delay.dispose();
    synth.reverb.dispose();
    synth.gain.dispose();
    synth.limiter.dispose();
  }, 350);
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
