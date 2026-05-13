import type { QuantizedThereminNote } from "@/app/tools/camera-theremin/lib/motion";
import {
  createToneFxGraph,
  type ToneFxGraph,
} from "@/lib/audio/fx-chain";
import type { FxPatternInput } from "@/lib/audio/fx-manifest";

export type CameraThereminPatch = {
  attack: number;
  chorusDepth: number;
  chorusRateHz: number;
  chorusWet: number;
  decay: number;
  detuneSpreadCents: number;
  delayFeedback: number;
  delayTimeSec: number;
  delayWet: number;
  driveAmount: number;
  driveWet: number;
  filterMultiplier: number;
  filterQ: number;
  masterGainFloor: number;
  masterGainRange: number;
  motionRampSec: number;
  octaveLayer: "both" | "off" | "sub" | "upper";
  oscillatorType: "sawtooth" | "sine" | "square" | "triangle";
  portamento: number;
  reverbDecay: number;
  reverbPreDelay: number;
  reverbWet: number;
  release: number;
  sustain: number;
  tremoloDepth: number;
  tremoloRateHz: number;
  tremoloWet: number;
  vibratoDepth: number;
  vibratoRateHz: number;
  vibratoWet: number;
};

type ToneModule = typeof import("tone");
type ToneSynth = import("tone").Synth;
type ToneChorus = import("tone").Chorus;
type ToneDistortion = import("tone").Distortion;
type ToneFilter = import("tone").Filter;
type ToneFeedbackDelay = import("tone").FeedbackDelay;
type ToneGain = import("tone").Gain;
type ToneLimiter = import("tone").Limiter;
type TonePanner = import("tone").Panner;
type ToneReverb = import("tone").Reverb;
type ToneTremolo = import("tone").Tremolo;
type ToneVibrato = import("tone").Vibrato;

type ActiveCameraThereminSynth = {
  chorus: ToneChorus;
  delay: ToneFeedbackDelay;
  drive: ToneDistortion;
  engagedVoices: boolean[];
  filter: ToneFilter;
  gain: ToneGain;
  limiter: ToneLimiter;
  panner: TonePanner;
  patch: CameraThereminPatch;
  reverb: ToneReverb;
  fxGraph: ToneFxGraph;
  synths: ToneSynth[];
  Tone: ToneModule;
  tremolo: ToneTremolo;
  vibrato: ToneVibrato;
};

const maxChordVoices = 6;
let activeSynth: ActiveCameraThereminSynth | null = null;

export async function startCameraThereminSynth({
  bpm,
  fxPattern,
  prompt,
}: {
  bpm: number;
  fxPattern?: FxPatternInput | null;
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
          attack: patch.attack,
          decay: patch.decay,
          release: patch.release,
          sustain: patch.sustain,
        },
        oscillator: {
          type: patch.oscillatorType,
        },
        portamento: patch.portamento,
      }),
  );
  const filter = new Tone.Filter(1800, "lowpass");
  filter.Q.value = patch.filterQ;
  const panner = new Tone.Panner(0);
  const vibrato = new Tone.Vibrato({
    depth: patch.vibratoDepth,
    frequency: patch.vibratoRateHz,
    wet: patch.vibratoWet,
  });
  const drive = new Tone.Distortion({
    distortion: patch.driveAmount,
    wet: patch.driveWet,
  });
  const chorus = new Tone.Chorus({
    delayTime: 3.6,
    depth: patch.chorusDepth,
    frequency: patch.chorusRateHz,
    spread: 160,
    wet: patch.chorusWet,
  });
  chorus.start();
  const tremolo = new Tone.Tremolo({
    depth: patch.tremoloDepth,
    frequency: patch.tremoloRateHz,
    spread: 145,
    wet: patch.tremoloWet,
  });
  tremolo.start();
  const delay = new Tone.FeedbackDelay({
    delayTime: patch.delayTimeSec,
    feedback: patch.delayFeedback,
    wet: patch.delayWet,
  });
  const reverb = new Tone.Reverb({
    decay: patch.reverbDecay,
    preDelay: patch.reverbPreDelay,
    wet: patch.reverbWet,
  });
  const gain = new Tone.Gain(0);
  const limiter = new Tone.Limiter(-1);
  const fxGraph = await createToneFxGraph({
    fxPattern,
    limiterDb: -1,
    Tone,
  });

  for (const synth of synths) {
    synth.connect(vibrato);
  }
  await reverb.ready;
  vibrato.chain(
    filter,
    drive,
    chorus,
    tremolo,
    panner,
    delay,
    reverb,
    gain,
    limiter,
  );
  limiter.connect(fxGraph.input as Parameters<ToneLimiter["connect"]>[0]);
  activeSynth = {
    chorus,
    delay,
    drive,
    engagedVoices: synths.map(() => false),
    filter,
    gain,
    limiter,
    panner,
    patch,
    reverb,
    fxGraph,
    synths,
    Tone,
    tremolo,
    vibrato,
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
  const gritty = /\b(grit|noise|acid|saw|bright|brass|fuzz|distort|dirty)\b/.test(
    lower,
  );
  const hollow = /\b(square|hollow|reed|nasal)\b/.test(lower);
  const dubby = /\b(dub|echo|delay|space|ambient)\b/.test(lower);
  const slow = /\b(slow|legato|bow|drone|long)\b/.test(lower);
  const plucky = /\b(fast|snappy|pluck|percussive|tight|responsive)\b/.test(
    lower,
  );
  const pulsing = /\b(tremolo|pulse|pulsing|flutter|gated|rhythmic)\b/.test(
    lower,
  );
  const wide = /\b(wide|stereo|lush|chorus|ensemble|spread|unison)\b/.test(lower);
  const subby = /\b(sub|bass|low|deep)\b/.test(lower);
  const airy = /\b(high|treble|top|shimmer|sparkle|air|piercing)\b/.test(lower);
  const vibrato = /\b(vibrato|warble|wobble|bowed|glide)\b/.test(lower);
  const acid = /\b(acid|resonant|squelch)\b/.test(lower);
  const beatHz = clamp(bpm / 60, 0.4, 4.4);

  return {
    attack: slow ? 0.045 : plucky ? 0.006 : 0.025,
    chorusDepth: wide || glassy ? 0.58 : 0.24,
    chorusRateHz: slow || glassy ? 0.18 : 0.38,
    chorusWet: wide || glassy ? 0.32 : 0.12,
    decay: plucky ? 0.08 : 0.16,
    detuneSpreadCents: wide || glassy ? 7 : gritty ? 3 : 4,
    delayFeedback: dubby ? 0.34 : 0.22,
    delayTimeSec: round(beatSec * (dubby ? 0.75 : 0.5), 3),
    delayWet: dubby ? 0.28 : pulsing ? 0.2 : 0.14,
    driveAmount: gritty ? (acid ? 0.42 : 0.28) : glassy ? 0.02 : 0.08,
    driveWet: gritty ? 0.24 : glassy ? 0.04 : 0.08,
    filterMultiplier: gritty || airy ? 1.18 : subby ? 0.78 : 1,
    filterQ: acid ? 8 : gritty ? 3.2 : glassy ? 1.8 : 1.2,
    masterGainFloor: 0.035,
    masterGainRange: wide ? 0.34 : 0.42,
    motionRampSec: plucky ? 0.025 : slow ? 0.13 : 0.07,
    octaveLayer: subby && airy ? "both" : subby ? "sub" : airy ? "upper" : "off",
    oscillatorType: gritty
      ? "sawtooth"
      : hollow
        ? "square"
        : glassy
          ? "triangle"
          : "sine",
    portamento: slow ? 0.075 : plucky ? 0.012 : 0.035,
    reverbDecay: dubby || slow ? 3.4 : 2.2,
    reverbPreDelay: slow ? 0.035 : 0.02,
    reverbWet: dubby || glassy ? 0.24 : 0.16,
    release: slow ? 0.42 : 0.24,
    sustain: plucky ? 0.48 : 0.72,
    tremoloDepth: pulsing ? 0.42 : 0.06,
    tremoloRateHz: pulsing ? round(beatHz * 2, 2) : 0.35,
    tremoloWet: pulsing ? 0.34 : 0.06,
    vibratoDepth: vibrato || slow ? 0.16 : 0.045,
    vibratoRateHz: slow ? 4.2 : 5.6,
    vibratoWet: vibrato || slow ? 0.16 : 0.06,
  };
}

export function updateCameraThereminSynth(note: QuantizedThereminNote | null) {
  if (!activeSynth) {
    return;
  }

  const now = activeSynth.Tone.now();
  const frequencies = note
    ? getCameraThereminVoiceFrequencies(note, activeSynth.patch)
    : [];
  if (!note || note.volume <= 0.02) {
    activeSynth.gain.gain.rampTo(0, 0.05);
    releaseUnusedVoices(activeSynth, 0, now + 0.04);
    return;
  }

  activeSynth.filter.frequency.rampTo(
    clamp(note.filterHz * activeSynth.patch.filterMultiplier, 120, 14500),
    activeSynth.patch.motionRampSec,
  );
  activeSynth.filter.Q.value =
    activeSynth.patch.filterQ + note.brightness * 1.8;
  activeSynth.gain.gain.rampTo(
    activeSynth.patch.masterGainFloor +
      note.volume * activeSynth.patch.masterGainRange,
    0.045,
  );
  activeSynth.panner.pan.rampTo(note.pan, activeSynth.patch.motionRampSec);

  frequencies.forEach((frequency, index) => {
    const synth = activeSynth?.synths[index];
    if (!activeSynth || !synth) {
      return;
    }
    synth.detune.value = getVoiceDetuneCents(
      index,
      frequencies.length,
      activeSynth.patch.detuneSpreadCents,
    );
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
    synth.vibrato.dispose();
    synth.drive.dispose();
    synth.chorus.dispose();
    synth.tremolo.dispose();
    synth.delay.dispose();
    synth.reverb.dispose();
    synth.gain.dispose();
    synth.limiter.dispose();
    synth.fxGraph.dispose();
  }, 350);
}

export function getCameraThereminVoiceFrequencies(
  note: QuantizedThereminNote,
  patch: CameraThereminPatch,
) {
  const frequencies = note.frequencies.slice(0, 4);
  const rootFrequency = frequencies[0];
  if (rootFrequency) {
    if (patch.octaveLayer === "sub" || patch.octaveLayer === "both") {
      frequencies.push(round(rootFrequency / 2, 3));
    }
    if (patch.octaveLayer === "upper" || patch.octaveLayer === "both") {
      frequencies.push(round(rootFrequency * 2, 3));
    }
  }

  return frequencies.slice(0, maxChordVoices);
}

function getVoiceDetuneCents(index: number, voiceCount: number, spreadCents: number) {
  if (voiceCount <= 1 || spreadCents <= 0) {
    return 0;
  }

  const center = (voiceCount - 1) / 2;
  return round((index - center) * spreadCents, 3);
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
