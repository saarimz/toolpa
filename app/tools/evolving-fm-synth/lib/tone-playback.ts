"use client";

import {
  collectSynthEvents,
  collectSynthModulationEvents,
  getSynthSceneDurationSec,
  morphPartials,
  type SynthEvent,
  type SynthModulationEvent,
} from "./events";
import type { SynthScene, SynthVoice } from "./schema";

type ToneModule = typeof import("tone");

type DisposablePart = {
  loop: boolean | number;
  loopEnd: unknown;
  start: (time?: number) => unknown;
  stop: () => unknown;
  dispose: () => unknown;
};

type PlayableSynth = {
  triggerAttackRelease: (
    notes: string | number,
    duration: number,
    time?: unknown,
    velocity?: number,
  ) => unknown;
  set: (options: unknown) => unknown;
  connect: (destination: unknown) => unknown;
  releaseAll: () => unknown;
  dispose: () => unknown;
  volume: { value: number };
};

type DisposableNode = {
  connect: (destination: unknown) => unknown;
  dispose: () => unknown;
};

type WetNode = DisposableNode & {
  wet: { value: number };
};

type DepthNode = WetNode & {
  depth: number;
};

type DriveNode = WetNode & {
  distortion: number;
};

type FilterNode = DisposableNode & {
  frequency: {
    setValueAtTime: (value: number, time: unknown) => unknown;
    linearRampToValueAtTime: (value: number, time: unknown) => unknown;
  };
  Q: { value: number };
};

let activePart: DisposablePart | null = null;
let activeModulationPart: DisposablePart | null = null;
const activeSynths = new Map<string, PlayableSynth>();
const activeVoices = new Map<string, SynthVoice>();
const activeNodes = new Set<DisposableNode>();

export async function playEvolvingFmSynthScene(scene: SynthScene) {
  const Tone = await import("tone");
  await Tone.start();
  await stopEvolvingFmSynthScene();

  const transport = Tone.getTransport();
  transport.bpm.value = scene.bpm;
  transport.swing = scene.swing;
  transport.swingSubdivision = "16n";

  const effects = await createEffects(Tone, scene);
  for (const voice of scene.voices) {
    const synth = createToneSynth(Tone, voice);
    synth.connect(effects.input);
    activeSynths.set(voice.id, synth);
    activeVoices.set(voice.id, voice);
  }

  const events = collectSynthEvents(scene);
  const modulationEvents = collectSynthModulationEvents(scene);
  const part = new Tone.Part((time: number, event: SynthEvent) => {
    const synth = activeSynths.get(event.voiceId);
    if (!synth) {
      return;
    }

    synth.set({
      modulationIndex: event.modulationIndex,
      oscillator: {
        type: "custom",
        partials: event.partials,
      },
    });
    automateFilter(effects.filter, scene, event, time);
    synth.triggerAttackRelease(event.note, event.durationSec, time, event.velocity);
  }, events.map((event) => [event.timeSec, event] as const));
  const modulationPart = new Tone.Part((time: number, event: SynthModulationEvent) => {
    applyBarModulation(effects, event, time);
    for (const [voiceId, synth] of activeSynths) {
      const voice = activeVoices.get(voiceId);
      if (!voice) {
        continue;
      }

      synth.set({
        harmonicity: Math.max(0.125, voice.patch.harmonicity + event.harmonicityShift),
        modulationIndex: Math.min(
          48,
          Math.max(0, voice.patch.modulationIndex * event.modulationScale),
        ),
        oscillator: {
          type: "custom",
          partials: morphPartials(voice.patch.partials, event.partialMorph),
        },
      });
    }
  }, modulationEvents.map((event) => [event.timeSec, event] as const));

  part.loop = true;
  part.loopEnd = getSynthSceneDurationSec(scene);
  part.start(0);
  activePart = part;
  modulationPart.loop = true;
  modulationPart.loopEnd = getSynthSceneDurationSec(scene);
  modulationPart.start(0);
  activeModulationPart = modulationPart;

  transport.stop();
  transport.position = 0;
  transport.start();
}

export async function stopEvolvingFmSynthScene() {
  const Tone = await import("tone");
  activePart?.stop();
  activePart?.dispose();
  activePart = null;
  activeModulationPart?.stop();
  activeModulationPart?.dispose();
  activeModulationPart = null;

  for (const synth of activeSynths.values()) {
    synth.releaseAll();
    synth.dispose();
  }
  activeSynths.clear();
  activeVoices.clear();

  for (const node of activeNodes) {
    node.dispose();
  }
  activeNodes.clear();

  Tone.getTransport().stop();
  Tone.getTransport().cancel();
}

function createToneSynth(Tone: ToneModule, voice: SynthVoice): PlayableSynth {
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    oscillator: {
      type: "custom",
      partials: voice.patch.partials,
    },
    modulation: {
      type: voice.patch.modulationType,
    },
    envelope: {
      attack: voice.patch.attack,
      decay: voice.patch.decay,
      sustain: voice.patch.sustain,
      release: voice.patch.release,
    },
    modulationEnvelope: {
      attack: voice.patch.modulationAttack,
      decay: voice.patch.decay,
      sustain: voice.patch.sustain,
      release: voice.patch.modulationRelease,
    },
    harmonicity: voice.patch.harmonicity,
    modulationIndex: voice.patch.modulationIndex,
    detune: voice.patch.detuneCents,
  }) as PlayableSynth;

  synth.volume.value = voice.gainDb;
  return synth;
}

async function createEffects(Tone: ToneModule, scene: SynthScene) {
  const filter = new Tone.Filter(
    scene.effects.filter.cutoffHz,
    "lowpass",
    -24,
  ) as FilterNode;
  filter.Q.value = scene.effects.filter.resonance;

  const drive = new Tone.Distortion(scene.effects.drive.amount) as DriveNode;
  drive.wet.value = scene.effects.drive.wet;

  const chorus = new Tone.Chorus({
    frequency: scene.effects.chorus.rateHz,
    delayTime: 3.5,
    depth: scene.effects.chorus.depth,
    wet: scene.effects.chorus.wet,
  }) as DepthNode & { start: () => unknown };
  chorus.start();

  const delay = new Tone.FeedbackDelay({
    delayTime: scene.effects.delay.time,
    feedback: scene.effects.delay.feedback,
    wet: scene.effects.delay.wet,
  }) as WetNode;

  const reverb = new Tone.Reverb({
    decay: scene.effects.reverb.decay,
    preDelay: scene.effects.reverb.preDelay,
    wet: scene.effects.reverb.wet,
  }) as WetNode & { ready: Promise<void> };
  await reverb.ready;

  const limiter = new Tone.Limiter(scene.effects.masterDb) as DisposableNode;
  filter.connect(drive);
  drive.connect(chorus);
  chorus.connect(delay);
  delay.connect(reverb);
  reverb.connect(limiter);
  limiter.connect(Tone.getDestination());

  for (const node of [filter, drive, chorus, delay, reverb, limiter]) {
    activeNodes.add(node);
  }

  return { input: filter, filter, drive, chorus, delay, reverb };
}

function applyBarModulation(
  effects: Awaited<ReturnType<typeof createEffects>>,
  event: SynthModulationEvent,
  time: number,
) {
  effects.filter.frequency.setValueAtTime(event.cutoffHz, time);
  effects.filter.frequency.linearRampToValueAtTime(
    event.cutoffHz,
    time + 0.05,
  );
  effects.filter.Q.value = event.resonance;
  effects.delay.wet.value = event.delayWet;
  effects.reverb.wet.value = event.reverbWet;
  effects.chorus.depth = event.chorusDepth;
  effects.drive.distortion = event.driveAmount;
}

function automateFilter(
  filter: FilterNode,
  scene: SynthScene,
  event: SynthEvent,
  time: number,
) {
  const normalizedStep =
    event.stepIndex / Math.max(1, scene.bars * scene.stepsPerBar - 1);
  const base = scene.effects.filter.cutoffHz;
  const motion = scene.effects.filter.motion;
  const sweep = Math.sin(normalizedStep * Math.PI * 2 + event.partials[1] * Math.PI);
  const start = clampFrequency(base * (0.84 + sweep * motion * 0.3));
  const end = clampFrequency(
    start + base * motion * (0.1 + event.velocity * 0.28),
  );

  filter.frequency.setValueAtTime(start, time);
  filter.frequency.linearRampToValueAtTime(end, time + event.durationSec * 0.35);
}

function clampFrequency(value: number) {
  return Math.max(80, Math.min(12000, value));
}
