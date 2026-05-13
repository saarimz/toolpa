"use client";

import type { MidiClip } from "./schema";

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
    note: number | string,
    duration: number,
    time?: unknown,
    velocity?: number,
  ) => unknown;
  connect: (destination: unknown) => unknown;
  dispose: () => unknown;
  releaseAll: () => unknown;
  volume: { value: number };
};

type DisposableNode = {
  connect: (destination: unknown) => unknown;
  dispose: () => unknown;
};

type ScheduledMidiNote = {
  durationSec: number;
  midi: number;
  timeSec: number;
  velocity: number;
};

let activePart: DisposablePart | null = null;
let activeSynth: PlayableSynth | null = null;
let activeLimiter: DisposableNode | null = null;

export async function playMidiClipPreview(clip: MidiClip) {
  const Tone = await import("tone");
  await Tone.start();
  await stopMidiClipPreview();

  const transport = Tone.getTransport();
  transport.bpm.value = clip.bpm;
  transport.swing = clip.swing;
  transport.swingSubdivision = "16n";

  const limiter = new Tone.Limiter(-1) as DisposableNode;
  limiter.connect(Tone.getDestination());
  const synth = createPreviewSynth(Tone);
  synth.connect(limiter);

  const events = collectPreviewEvents(clip);
  const part = new Tone.Part((time: number, event: ScheduledMidiNote) => {
    synth.triggerAttackRelease(
      midiToFrequency(event.midi),
      Math.max(0.03, event.durationSec),
      time,
      event.velocity,
    );
  }, events.map((event) => [event.timeSec, event] as const)) as DisposablePart;

  part.loop = true;
  part.loopEnd = getClipDurationSec(clip);
  part.start(0);
  activePart = part;
  activeSynth = synth;
  activeLimiter = limiter;

  transport.stop();
  transport.position = 0;
  transport.start();
}

export async function stopMidiClipPreview() {
  const Tone = await import("tone");
  activePart?.stop();
  activePart?.dispose();
  activePart = null;
  activeSynth?.releaseAll();
  activeSynth?.dispose();
  activeSynth = null;
  activeLimiter?.dispose();
  activeLimiter = null;
  Tone.getTransport().stop();
  Tone.getTransport().cancel();
}

function createPreviewSynth(Tone: ToneModule): PlayableSynth {
  const synth = new Tone.PolySynth(Tone.Synth, {
    envelope: {
      attack: 0.006,
      decay: 0.08,
      release: 0.18,
      sustain: 0.62,
    },
    oscillator: {
      type: "sine",
    },
  }) as PlayableSynth;
  synth.volume.value = -10;
  return synth;
}

function collectPreviewEvents(clip: MidiClip): ScheduledMidiNote[] {
  const beatDurationSec = 60 / clip.bpm;
  const mutedTracks = new Set(
    clip.tracks.filter((track) => track.mute).map((track) => track.id),
  );

  return clip.notes
    .filter((note) => !mutedTracks.has(note.trackId))
    .map((note) => ({
      durationSec: note.durationBeats * beatDurationSec,
      midi: note.midi,
      timeSec: note.startBeat * beatDurationSec,
      velocity: note.velocity,
    }))
    .sort((left, right) => left.timeSec - right.timeSec || left.midi - right.midi);
}

function getClipDurationSec(clip: MidiClip) {
  return (60 / clip.bpm) * clip.bars * 4;
}

function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}
